import {
  type IBackend,
  type IBuffer,
  type ICommandEncoder,
  type IPipeline,
  type IRenderTarget,
  type ISampler,
  type ITexture,
  type DrawCall,
  type PipelineDescriptor,
  type RenderPassDescriptor,
  type SamplerDescriptor,
  type TextureBinding,
  type SamplerBinding,
  type TextureFormat,
  type UniformType,
} from "./types.js";
import { ShaderCompileError, formatShaderError } from "../util/errors.js";
import { DEV } from "../util/env.js";

const UNIFORM_SIZES: Record<UniformType, number> = {
  f32: 4,
  i32: 4,
  u32: 4,
  vec2: 8,
  vec3: 16, // std140 padding
  vec4: 16,
  mat3: 48, // 3 * vec3 with padding
  mat4: 64,
};

let pipelineIdSeq = 0;

class WGPUBuffer implements IBuffer {
  constructor(
    private readonly backend: WebGPUBackend,
    readonly handle: GPUBuffer,
    readonly byteLength: number,
  ) {}
  write(data: ArrayBufferView, offset = 0): void {
    this.backend.device.queue.writeBuffer(
      this.handle,
      offset,
      data.buffer as ArrayBuffer,
      data.byteOffset,
      data.byteLength,
    );
  }
  destroy(): void {
    this.handle.destroy();
    this.backend.stats.buffers--;
    this.backend.stats.bytes -= this.byteLength;
  }
}

class WGPUTexture implements ITexture {
  constructor(
    private readonly backend: WebGPUBackend,
    readonly handle: GPUTexture,
    readonly view: GPUTextureView,
    readonly width: number,
    readonly height: number,
    readonly format: TextureFormat,
  ) {}
  upload(data: ArrayBufferView): void {
    this.backend.device.queue.writeTexture(
      { texture: this.handle },
      data.buffer as ArrayBuffer,
      { bytesPerRow: this.width * 4, rowsPerImage: this.height },
      { width: this.width, height: this.height },
    );
  }
  uploadImage(source: ImageBitmap | HTMLCanvasElement): void {
    this.backend.device.queue.copyExternalImageToTexture(
      { source },
      { texture: this.handle },
      { width: this.width, height: this.height },
    );
  }
  destroy(): void {
    this.handle.destroy();
    this.backend.stats.textures--;
    this.backend.stats.bytes -= this.width * this.height * 4;
  }
}

class WGPURenderTarget implements IRenderTarget {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly colorTexture: WGPUTexture,
    readonly depthTexture: GPUTexture,
    readonly msaaTexture: GPUTexture | null,
  ) {}
  destroy(): void {
    this.colorTexture.destroy();
    this.depthTexture.destroy();
    this.msaaTexture?.destroy();
  }
}

let samplerIdSeq = 0;
class WGPUSampler implements ISampler {
  readonly id = ++samplerIdSeq;
  constructor(
    private readonly backend: WebGPUBackend,
    readonly handle: GPUSampler,
  ) {}
  destroy(): void {
    void this.backend;
  }
}

interface UniformSlot {
  name: string;
  binding: number;
  size: number;
  type: UniformType;
  buffer: GPUBuffer;
  bytes: ArrayBuffer;
}

interface WGPUPipelineInternal extends IPipeline {
  readonly handle: GPURenderPipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly uniformSlots: UniformSlot[];
  readonly vertexStride: number;
  readonly textures: TextureBinding[];
  readonly samplers: SamplerBinding[];
  readonly depthTest: boolean;
}

class WGPUCommandEncoder implements ICommandEncoder {
  private encoder: GPUCommandEncoder;
  private pass: GPURenderPassEncoder | null = null;
  private drawIndex = 0;
  constructor(private readonly backend: WebGPUBackend) {
    this.encoder = backend.device.createCommandEncoder();
  }
  beginPass(desc: RenderPassDescriptor): void {
    this.drawIndex = 0;
    const target = desc.target as WGPURenderTarget | undefined;
    const canvasView = target
      ? target.colorTexture.view
      : this.backend.context.getCurrentTexture().createView();
    const msaaView = target
      ? target.msaaTexture?.createView() ?? null
      : this.backend.ensureMsaaView();
    const cc = desc.clearColor ?? [0, 0, 0, 1];
    const wantsDepth = desc.depth === true;
    const depthView = target
      ? target.depthTexture.createView()
      : wantsDepth
        ? this.backend.ensureDepthView()
        : null;
    const colorAttachment: GPURenderPassColorAttachment =
      msaaView
        ? {
            view: msaaView,
            resolveTarget: canvasView,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: cc[0], g: cc[1], b: cc[2], a: cc[3] },
          }
        : {
            view: canvasView,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: cc[0], g: cc[1], b: cc[2], a: cc[3] },
          };
    this.pass = this.encoder.beginRenderPass({
      colorAttachments: [colorAttachment],
      ...(depthView
        ? {
            depthStencilAttachment: {
              view: depthView,
              depthClearValue: desc.clearDepth ?? 1.0,
              depthLoadOp: "clear" as GPULoadOp,
              depthStoreOp: "store" as GPUStoreOp,
            },
          }
        : {}),
    });
  }
  draw(call: DrawCall): void {
    if (!this.pass) throw new Error("[glint] draw called outside of pass");
    const pipe = call.pipeline as WGPUPipelineInternal;
    const idx = this.drawIndex++;
    const isolate = this.backend.debug.isolateDraw;
    if (isolate !== null && isolate !== idx) return;
    if (this.backend.debug.logCalls) {
      console.debug(`[glint] webgpu draw#${idx}`, {
        pipeline: pipe.id,
        verts: call.vertexCount,
        idx: call.indexCount ?? null,
      });
    }

    // write each uniform into its own UBO (one var<uniform> per binding)
    for (const slot of pipe.uniformSlots) {
      const v = call.uniforms[slot.name];
      if (!v) continue;
      // Handle mat3 -> std140 padding: mat3 needs 3 vec4 rows in std140, input is 9 floats tight.
      if (slot.type === "mat3" && v.byteLength === 36) {
        const padded = new Float32Array(12);
        const src = v as Float32Array;
        padded[0] = src[0]!; padded[1] = src[1]!; padded[2] = src[2]!;
        padded[4] = src[3]!; padded[5] = src[4]!; padded[6] = src[5]!;
        padded[8] = src[6]!; padded[9] = src[7]!; padded[10] = src[8]!;
        this.backend.device.queue.writeBuffer(slot.buffer, 0, padded.buffer);
      } else if (slot.type === "vec3" && v.byteLength === 12) {
        const padded = new Float32Array(4);
        const src = v as Float32Array;
        padded[0] = src[0]!; padded[1] = src[1]!; padded[2] = src[2]!;
        this.backend.device.queue.writeBuffer(slot.buffer, 0, padded.buffer);
      } else {
        const bytes = new Uint8Array(slot.bytes);
        bytes.set(new Uint8Array(v.buffer, v.byteOffset, Math.min(v.byteLength, slot.size)));
        this.backend.device.queue.writeBuffer(slot.buffer, 0, slot.bytes);
      }
    }

    const entries: GPUBindGroupEntry[] = [];
    for (const slot of pipe.uniformSlots) {
      entries.push({ binding: slot.binding, resource: { buffer: slot.buffer } });
    }
    for (const t of pipe.textures) {
      const tex = call.textures?.[t.name];
      if (!tex) throw new Error(`[glint] draw: missing texture '${t.name}'`);
      entries.push({
        binding: t.binding,
        resource: (tex as WGPUTexture).view,
      });
    }
    for (const s of pipe.samplers) {
      const smp = call.samplers?.[s.name];
      if (!smp) throw new Error(`[glint] draw: missing sampler '${s.name}'`);
      entries.push({
        binding: s.binding,
        resource: (smp as WGPUSampler).handle,
      });
    }
    const bindGroup = this.backend.device.createBindGroup({
      layout: pipe.bindGroupLayout,
      entries,
    });

    this.pass.setPipeline(pipe.handle);
    this.pass.setBindGroup(0, bindGroup);
    this.pass.setVertexBuffer(0, (call.vertexBuffer as WGPUBuffer).handle);
    if (call.instanceBuffer) {
      this.pass.setVertexBuffer(1, (call.instanceBuffer as WGPUBuffer).handle);
    }

    if (call.indexBuffer && call.indexCount) {
      this.pass.setIndexBuffer(
        (call.indexBuffer as WGPUBuffer).handle,
        call.indexFormat ?? "uint16",
      );
      this.pass.drawIndexed(
        call.indexCount,
        call.instanceCount ?? 1,
      );
    } else {
      this.pass.draw(call.vertexCount, call.instanceCount ?? 1);
    }
    this.backend.stats.drawCalls++;
    const primCount = call.indexCount ?? call.vertexCount;
    if (pipe.handle) {
      // crude: assume triangle-list for counting; ok for stats overlay
      this.backend.stats.triangles += Math.floor(primCount / 3) * (call.instanceCount ?? 1);
    }
  }
  endPass(): void {
    this.pass?.end();
    this.pass = null;
  }
  submit(): void {
    this.backend.device.queue.submit([this.encoder.finish()]);
  }
}

export class WebGPUBackend implements IBackend {
  readonly kind = "webgpu" as const;
  stats = { drawCalls: 0, triangles: 0, pipelines: 0, buffers: 0, textures: 0, bytes: 0 };
  debug: IBackend["debug"] = { isolateDraw: null, logCalls: false };
  readonly sampleCount: number;
  private depthTex: GPUTexture | null = null;
  private msaaTex: GPUTexture | null = null;
  private auxW = 0;
  private auxH = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly adapter: GPUAdapter,
    readonly device: GPUDevice,
    readonly context: GPUCanvasContext,
    readonly format: GPUTextureFormat,
    sampleCount = 4,
  ) {
    this.sampleCount = sampleCount;
  }

  private ensureAux(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.auxW === w && this.auxH === h && this.depthTex && (this.sampleCount === 1 || this.msaaTex)) {
      return;
    }
    this.depthTex?.destroy();
    this.msaaTex?.destroy();
    this.depthTex = this.device.createTexture({
      size: { width: w, height: h },
      format: "depth24plus",
      sampleCount: this.sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.msaaTex =
      this.sampleCount > 1
        ? this.device.createTexture({
            size: { width: w, height: h },
            format: this.format,
            sampleCount: this.sampleCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
        : null;
    this.auxW = w;
    this.auxH = h;
  }

  ensureDepthView(): GPUTextureView {
    this.ensureAux();
    return this.depthTex!.createView();
  }

  ensureMsaaView(): GPUTextureView | null {
    this.ensureAux();
    return this.msaaTex ? this.msaaTex.createView() : null;
  }

  static async create(
    canvas: HTMLCanvasElement,
    sampleCount = 4,
  ): Promise<WebGPUBackend | null> {
    const navGpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!navGpu) return null;
    const adapter = await navGpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!ctx) return null;
    const format = navGpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });
    return new WebGPUBackend(canvas, adapter, device, ctx, format, sampleCount);
  }

  get width(): number {
    return this.canvas.width;
  }
  get height(): number {
    return this.canvas.height;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  createBuffer(usage: "vertex" | "index" | "uniform", size: number): IBuffer {
    const usageMap = {
      vertex: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      index: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      uniform: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    };
    const handle = this.device.createBuffer({
      size: Math.max(size, 4),
      usage: usageMap[usage],
    });
    this.stats.buffers++;
    this.stats.bytes += size;
    return new WGPUBuffer(this, handle, size);
  }

  createTexture(width: number, height: number, format: TextureFormat): ITexture {
    const fmtMap: Record<TextureFormat, GPUTextureFormat> = {
      rgba8unorm: "rgba8unorm",
      r8unorm: "r8unorm",
      "depth24plus": "depth24plus",
    };
    const handle = this.device.createTexture({
      size: { width, height },
      format: fmtMap[format],
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.stats.textures++;
    this.stats.bytes += width * height * 4;
    return new WGPUTexture(this, handle, handle.createView(), width, height, format);
  }

  createRenderTarget(width: number, height: number): IRenderTarget {
    // Resolved 1x color texture — shader-sampleable.
    const colorHandle = this.device.createTexture({
      size: { width, height },
      format: this.format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depthHandle = this.device.createTexture({
      size: { width, height },
      format: "depth24plus",
      sampleCount: this.sampleCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const msaaHandle =
      this.sampleCount > 1
        ? this.device.createTexture({
            size: { width, height },
            format: this.format,
            sampleCount: this.sampleCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          })
        : null;
    this.stats.textures += msaaHandle ? 3 : 2;
    this.stats.bytes += width * height * 4 * (msaaHandle ? 2 + this.sampleCount : 2);
    const colorTex = new WGPUTexture(
      this,
      colorHandle,
      colorHandle.createView(),
      width,
      height,
      "rgba8unorm",
    );
    return new WGPURenderTarget(width, height, colorTex, depthHandle, msaaHandle);
  }

  createSampler(desc: SamplerDescriptor = {}): ISampler {
    const addr = (w?: "clamp" | "repeat"): GPUAddressMode =>
      w === "repeat" ? "repeat" : "clamp-to-edge";
    const h = this.device.createSampler({
      minFilter: desc.minFilter ?? "linear",
      magFilter: desc.magFilter ?? "linear",
      addressModeU: addr(desc.wrapU),
      addressModeV: addr(desc.wrapV),
    });
    return new WGPUSampler(this, h);
  }

  createPipeline(desc: PipelineDescriptor): IPipeline {
    const module = this.safeCompile(desc.vertexShader.wgsl);

    const attributes: GPUVertexAttribute[] = desc.vertexLayout.attributes.map(
      (a) => ({
        shaderLocation: a.location,
        offset: a.offset,
        format: a.format as GPUVertexFormat,
      }),
    );
    const vertexBuffers: GPUVertexBufferLayout[] = [
      { arrayStride: desc.vertexLayout.stride, attributes, stepMode: "vertex" },
    ];
    if (desc.instanceLayout) {
      vertexBuffers.push({
        arrayStride: desc.instanceLayout.stride,
        stepMode: "instance",
        attributes: desc.instanceLayout.attributes.map((a) => ({
          shaderLocation: a.location,
          offset: a.offset,
          format: a.format as GPUVertexFormat,
        })),
      });
    }

    const textures = desc.textures ?? [];
    const samplers = desc.samplers ?? [];

    // Per-uniform UBOs, one buffer per binding.
    const uniformSlots: UniformSlot[] = [];
    for (const u of desc.uniforms) {
      const size = UNIFORM_SIZES[u.type];
      const alignedSize = Math.max(size, 16);
      const buffer = this.device.createBuffer({
        size: alignedSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      uniformSlots.push({
        name: u.name,
        binding: u.binding,
        size,
        type: u.type,
        buffer,
        bytes: new ArrayBuffer(alignedSize),
      });
    }

    const layoutEntries: GPUBindGroupLayoutEntry[] = [];
    for (const slot of uniformSlots) {
      layoutEntries.push({
        binding: slot.binding,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      });
    }
    for (const t of textures) {
      layoutEntries.push({
        binding: t.binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      });
    }
    for (const s of samplers) {
      layoutEntries.push({
        binding: s.binding,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      });
    }
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: layoutEntries,
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const blendState: GPUBlendState | undefined =
      desc.blend === "alpha"
        ? {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          }
        : desc.blend === "additive"
          ? {
              color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            }
          : undefined;

    const handle = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: this.findEntry(desc.vertexShader.wgsl, "vertex"),
        buffers: vertexBuffers,
      },
      fragment: {
        module,
        entryPoint: this.findEntry(desc.fragmentShader.wgsl, "fragment"),
        targets: [
          {
            format: this.format,
            ...(blendState ? { blend: blendState } : {}),
          },
        ],
      },
      primitive: {
        topology: desc.topology,
        cullMode: desc.cullMode ?? "none",
      },
      multisample: { count: this.sampleCount },
      ...(desc.depthTest
        ? {
            depthStencil: {
              format: "depth24plus",
              depthWriteEnabled: true,
              depthCompare: "less",
            },
          }
        : {}),
    });

    this.stats.pipelines++;
    const internal: WGPUPipelineInternal = {
      id: ++pipelineIdSeq,
      handle,
      bindGroupLayout,
      uniformSlots,
      vertexStride: desc.vertexLayout.stride,
      textures,
      samplers,
      depthTest: desc.depthTest ?? false,
      destroy: () => {
        for (const slot of uniformSlots) slot.buffer.destroy();
        this.stats.pipelines--;
      },
    };
    return internal;
  }

  private findEntry(wgsl: string, stage: "vertex" | "fragment"): string {
    const re = new RegExp(`@${stage}[\\s\\n]+fn\\s+(\\w+)`);
    const m = wgsl.match(re);
    if (!m) throw new Error(`[glint] WGSL missing @${stage} function`);
    return m[1]!;
  }

  private safeCompile(wgsl: string): GPUShaderModule {
    const module = this.device.createShaderModule({ code: wgsl });
    if (DEV && module.getCompilationInfo) {
      // Async validation; fire-and-forget surface.
      void module.getCompilationInfo().then((info) => {
        for (const msg of info.messages) {
          if (msg.type === "error") {
            const err = new ShaderCompileError(
              "vertex",
              "webgpu",
              msg.message,
              hintFor(msg.message),
              { code: wgsl, line: msg.lineNum, column: msg.linePos },
            );
            console.error(formatShaderError(err));
          }
        }
      });
    }
    return module;
  }

  createCommandEncoder(): ICommandEncoder {
    return new WGPUCommandEncoder(this);
  }

  resetFrameStats(): void {
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
  }

  destroy(): void {
    this.device.destroy();
  }
}

function hintFor(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("unresolved"))
    return "Name not declared in scope. Check for typos or missing struct/uniform declarations.";
  if (m.includes("type") && m.includes("mismatch"))
    return "Types on both sides of this operation disagree — try an explicit cast like vec4f(...).";
  if (m.includes("entry point"))
    return "Your shader needs exactly one @vertex and one @fragment function.";
  return "See the highlighted line above.";
}
