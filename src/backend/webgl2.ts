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
  type SamplerBinding,
  type SamplerDescriptor,
  type TextureFormat,
  type UniformType,
  type VertexFormat,
} from "./types.js";
import { ShaderCompileError, formatShaderError } from "../util/errors.js";
import { DEV } from "../util/env.js";

let pipelineIdSeq = 0;

const FMT_SIZE: Record<VertexFormat, { size: number; components: number; type: number; norm: boolean; integer: boolean }> = {
  float32: { size: 4, components: 1, type: 0x1406 /*FLOAT*/, norm: false, integer: false },
  float32x2: { size: 8, components: 2, type: 0x1406, norm: false, integer: false },
  float32x3: { size: 12, components: 3, type: 0x1406, norm: false, integer: false },
  float32x4: { size: 16, components: 4, type: 0x1406, norm: false, integer: false },
  uint16: { size: 2, components: 1, type: 0x1403 /*UNSIGNED_SHORT*/, norm: false, integer: true },
  uint16x2: { size: 4, components: 2, type: 0x1403, norm: false, integer: true },
  uint16x4: { size: 8, components: 4, type: 0x1403, norm: false, integer: true },
  uint32: { size: 4, components: 1, type: 0x1405 /*UNSIGNED_INT*/, norm: false, integer: true },
};

class GLBuffer implements IBuffer {
  constructor(
    private readonly backend: WebGL2Backend,
    readonly handle: WebGLBuffer,
    readonly target: number,
    readonly byteLength: number,
  ) {}
  write(data: ArrayBufferView, offset = 0): void {
    const gl = this.backend.gl;
    gl.bindBuffer(this.target, this.handle);
    gl.bufferSubData(this.target, offset, data);
  }
  destroy(): void {
    this.backend.gl.deleteBuffer(this.handle);
    this.backend.stats.buffers--;
    this.backend.stats.bytes -= this.byteLength;
  }
}

class GLTexture implements ITexture {
  constructor(
    private readonly backend: WebGL2Backend,
    readonly handle: WebGLTexture,
    readonly width: number,
    readonly height: number,
    readonly format: TextureFormat,
  ) {}
  upload(data: ArrayBufferView): void {
    const gl = this.backend.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    const [internalFormat, format, type] = glTexFormat(gl, this.format);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      this.width,
      this.height,
      0,
      format,
      type,
      data,
    );
  }
  uploadImage(source: ImageBitmap | HTMLCanvasElement): void {
    const gl = this.backend.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.handle);
    const [internalFormat, format, type] = glTexFormat(gl, this.format);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, source);
  }
  destroy(): void {
    this.backend.gl.deleteTexture(this.handle);
    this.backend.stats.textures--;
    this.backend.stats.bytes -= this.width * this.height * 4;
  }
}

class GLRenderTarget implements IRenderTarget {
  constructor(
    readonly backend: WebGL2Backend,
    readonly width: number,
    readonly height: number,
    readonly colorTexture: GLTexture,
    readonly depthRenderbuffer: WebGLRenderbuffer,
    readonly framebuffer: WebGLFramebuffer,
  ) {}
  destroy(): void {
    const gl = this.backend.gl;
    gl.deleteFramebuffer(this.framebuffer);
    gl.deleteRenderbuffer(this.depthRenderbuffer);
    this.colorTexture.destroy();
  }
}

let glSamplerIdSeq = 0;
class GLSampler implements ISampler {
  readonly id = ++glSamplerIdSeq;
  constructor(
    private readonly backend: WebGL2Backend,
    readonly handle: WebGLSampler,
  ) {}
  destroy(): void {
    this.backend.gl.deleteSampler(this.handle);
  }
}

function glTexFormat(
  gl: WebGL2RenderingContext,
  f: TextureFormat,
): [number, number, number] {
  switch (f) {
    case "rgba8unorm":
      return [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    case "r8unorm":
      return [gl.R8, gl.RED, gl.UNSIGNED_BYTE];
    case "depth24plus":
      return [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT];
  }
}

interface GLPipelineInternal extends IPipeline {
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly vertexStride: number;
  readonly attributes: PipelineDescriptor["vertexLayout"]["attributes"];
  readonly instanceStride: number;
  readonly instanceAttributes: PipelineDescriptor["vertexLayout"]["attributes"];
  readonly uniformLocations: Map<string, WebGLUniformLocation>;
  readonly uniformTypes: Map<string, UniformType>;
  readonly uniformNameMap: Map<string, string[]>; // wgsl name -> glsl names (u.field1, u.field2)
  readonly topology: number;
  readonly blend: "none" | "alpha" | "additive";
  readonly cullMode: "none" | "back" | "front";
  readonly depthTest: boolean;
  readonly textureBindings: Map<string, { unit: number; loc: WebGLUniformLocation }>;
  readonly samplers: SamplerBinding[];
  readonly samplerToTexture: Map<string, string>;
}

class GLCommandEncoder implements ICommandEncoder {
  private currentClear?: [number, number, number, number];
  private drawIndex = 0;
  constructor(private readonly backend: WebGL2Backend) {}
  beginPass(desc: RenderPassDescriptor): void {
    this.drawIndex = 0;
    const gl = this.backend.gl;
    const target = desc.target as GLRenderTarget | undefined;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
    } else if (this.backend.externalFramebuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.backend.externalFramebuffer);
      const vp = this.backend.externalViewport;
      if (vp) gl.viewport(vp.x, vp.y, vp.width, vp.height);
      else gl.viewport(0, 0, this.backend.canvas.width, this.backend.canvas.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.backend.canvas.width, this.backend.canvas.height);
    }
    const cc = desc.clearColor ?? [0, 0, 0, 1];
    gl.clearColor(cc[0], cc[1], cc[2], cc[3]);
    gl.clearDepth(desc.clearDepth ?? 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.currentClear = cc;
  }
  draw(call: DrawCall): void {
    const gl = this.backend.gl;
    const pipe = call.pipeline as GLPipelineInternal;
    const idx = this.drawIndex++;
    const isolate = this.backend.debug.isolateDraw;
    if (isolate !== null && isolate !== idx) return;
    if (this.backend.debug.logCalls) {
      console.debug(`[glint] webgl2 draw#${idx}`, {
        pipeline: pipe.id,
        verts: call.vertexCount,
        idx: call.indexCount ?? null,
      });
    }
    if (pipe.depthTest) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.useProgram(pipe.program);
    gl.bindVertexArray(pipe.vao);

    // bind vertex buffer into VAO bindings
    const vb = call.vertexBuffer as GLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb.handle);
    for (const a of pipe.attributes) {
      const fmt = FMT_SIZE[a.format];
      gl.enableVertexAttribArray(a.location);
      if (fmt.integer) {
        gl.vertexAttribIPointer(a.location, fmt.components, fmt.type, pipe.vertexStride, a.offset);
      } else {
        gl.vertexAttribPointer(a.location, fmt.components, fmt.type, fmt.norm, pipe.vertexStride, a.offset);
      }
      gl.vertexAttribDivisor(a.location, 0);
    }
    // bind instance buffer (if any) and flag per-instance attribs
    if (call.instanceBuffer && pipe.instanceAttributes.length > 0) {
      const ib = call.instanceBuffer as GLBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, ib.handle);
      for (const a of pipe.instanceAttributes) {
        const fmt = FMT_SIZE[a.format];
        gl.enableVertexAttribArray(a.location);
        if (fmt.integer) {
          gl.vertexAttribIPointer(a.location, fmt.components, fmt.type, pipe.instanceStride, a.offset);
        } else {
          gl.vertexAttribPointer(a.location, fmt.components, fmt.type, fmt.norm, pipe.instanceStride, a.offset);
        }
        gl.vertexAttribDivisor(a.location, 1);
      }
    }

    // Uniforms: write each declared uniform
    for (const [wgslName, value] of Object.entries(call.uniforms)) {
      const names = pipe.uniformNameMap.get(wgslName) ?? [wgslName];
      const type = pipe.uniformTypes.get(wgslName);
      if (!type) continue;
      if (names.length > 1) {
        // struct uniform: each field lives under `${wgslName}_${field}` in GLSL
        // We assume `value` is laid out sequentially in the same order as the struct fields.
        // For milestone 1 we simply pass one uniform per member via separate API calls.
        let offset = 0;
        for (const n of names) {
          const loc = pipe.uniformLocations.get(n);
          if (!loc) continue;
          offset = setUniformAt(gl, loc, type, value, offset);
        }
      } else {
        const loc = pipe.uniformLocations.get(names[0]!);
        if (!loc) continue;
        setUniform(gl, loc, type, value);
      }
    }

    // blend / cull
    if (pipe.blend === "none") gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      if (pipe.blend === "alpha") {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      }
    }
    if (pipe.cullMode === "none") gl.disable(gl.CULL_FACE);
    else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(pipe.cullMode === "back" ? gl.BACK : gl.FRONT);
    }

    // Bind textures + samplers to texture units
    let unit = 0;
    for (const [name, binding] of pipe.textureBindings) {
      const tex = call.textures?.[name];
      if (!tex) throw new Error(`[glint] draw: missing texture '${name}'`);
      gl.activeTexture(gl.TEXTURE0 + binding.unit);
      gl.bindTexture(gl.TEXTURE_2D, (tex as GLTexture).handle);
      gl.uniform1i(binding.loc, binding.unit);
      // Pair sampler to same unit if one of the declared samplers names this texture.
      // Milestone 2 convention: first declared sampler binds to all texture units in pipeline order.
      unit++;
    }
    if (call.samplers) {
      // Bind the (first) sampler to every texture unit used by this pipeline.
      const smp = Object.values(call.samplers)[0];
      if (smp) {
        for (const binding of pipe.textureBindings.values()) {
          gl.bindSampler(binding.unit, (smp as GLSampler).handle);
        }
      }
    }
    void unit;

    if (call.indexBuffer && call.indexCount) {
      const ib = call.indexBuffer as GLBuffer;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib.handle);
      const type = call.indexFormat === "uint32" ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      if ((call.instanceCount ?? 1) > 1) {
        gl.drawElementsInstanced(
          pipe.topology,
          call.indexCount,
          type,
          0,
          call.instanceCount!,
        );
      } else {
        gl.drawElements(pipe.topology, call.indexCount, type, 0);
      }
    } else {
      if ((call.instanceCount ?? 1) > 1) {
        gl.drawArraysInstanced(
          pipe.topology,
          0,
          call.vertexCount,
          call.instanceCount!,
        );
      } else {
        gl.drawArrays(pipe.topology, 0, call.vertexCount);
      }
    }
    this.backend.stats.drawCalls++;
    const primCount = call.indexCount ?? call.vertexCount;
    this.backend.stats.triangles += Math.floor(primCount / 3) * (call.instanceCount ?? 1);
  }
  endPass(): void {
    void this.currentClear;
  }
  submit(): void {
    // gl commands are implicit
  }
}

function setUniform(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  type: UniformType,
  v: Float32Array | Int32Array | Uint32Array,
): void {
  setUniformAt(gl, loc, type, v, 0);
}

function setUniformAt(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation,
  type: UniformType,
  v: Float32Array | Int32Array | Uint32Array,
  offset: number,
): number {
  const f = v as Float32Array;
  switch (type) {
    case "f32":
      gl.uniform1f(loc, f[offset]!);
      return offset + 1;
    case "i32":
      gl.uniform1i(loc, (v as Int32Array)[offset]!);
      return offset + 1;
    case "u32":
      gl.uniform1ui(loc, (v as Uint32Array)[offset]!);
      return offset + 1;
    case "vec2":
      gl.uniform2fv(loc, f.subarray(offset, offset + 2));
      return offset + 2;
    case "vec3":
      gl.uniform3fv(loc, f.subarray(offset, offset + 3));
      return offset + 3;
    case "vec4":
      gl.uniform4fv(loc, f.subarray(offset, offset + 4));
      return offset + 4;
    case "mat3":
      gl.uniformMatrix3fv(loc, false, f.subarray(offset, offset + 9));
      return offset + 9;
    case "mat4":
      gl.uniformMatrix4fv(loc, false, f.subarray(offset, offset + 16));
      return offset + 16;
  }
}

const TOPOLOGY: Record<string, number> = {
  "triangle-list": 0x0004, // TRIANGLES
  "triangle-strip": 0x0005,
  "line-list": 0x0001,
  "line-strip": 0x0003,
  "point-list": 0x0000,
};

export class WebGL2Backend implements IBackend {
  readonly kind = "webgl2" as const;
  stats = { drawCalls: 0, triangles: 0, pipelines: 0, buffers: 0, textures: 0, bytes: 0 };
  debug: IBackend["debug"] = { isolateDraw: null, logCalls: false };
  /** When set, overrides the default framebuffer + viewport (used by XR stereo rendering). */
  externalFramebuffer: WebGLFramebuffer | null = null;
  externalViewport: { x: number; y: number; width: number; height: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly gl: WebGL2RenderingContext) {}

  static create(canvas: HTMLCanvasElement): WebGL2Backend | null {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: true,
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    return new WebGL2Backend(canvas, gl);
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
    const gl = this.gl;
    const target = usage === "index" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    const h = gl.createBuffer();
    if (!h) throw new Error("[glint] failed to create GL buffer");
    gl.bindBuffer(target, h);
    gl.bufferData(target, size, gl.DYNAMIC_DRAW);
    this.stats.buffers++;
    this.stats.bytes += size;
    return new GLBuffer(this, h, target, size);
  }

  createTexture(width: number, height: number, format: TextureFormat): ITexture {
    const gl = this.gl;
    const h = gl.createTexture();
    if (!h) throw new Error("[glint] failed to create GL texture");
    gl.bindTexture(gl.TEXTURE_2D, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.stats.textures++;
    this.stats.bytes += width * height * 4;
    return new GLTexture(this, h, width, height, format);
  }

  createRenderTarget(width: number, height: number): IRenderTarget {
    const gl = this.gl;
    const colorH = gl.createTexture();
    if (!colorH) throw new Error("[glint] failed to create RT color texture");
    gl.bindTexture(gl.TEXTURE_2D, colorH);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const depthRb = gl.createRenderbuffer();
    if (!depthRb) throw new Error("[glint] failed to create RT depth renderbuffer");
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);

    const fb = gl.createFramebuffer();
    if (!fb) throw new Error("[glint] failed to create RT framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorH, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`[glint] incomplete framebuffer: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.stats.textures++;
    this.stats.bytes += width * height * 4;
    const colorTex = new GLTexture(this, colorH, width, height, "rgba8unorm");
    return new GLRenderTarget(this, width, height, colorTex, depthRb, fb);
  }

  createSampler(desc: SamplerDescriptor = {}): ISampler {
    const gl = this.gl;
    const h = gl.createSampler();
    if (!h) throw new Error("[glint] failed to create GL sampler");
    const filter = (f?: "nearest" | "linear"): number =>
      f === "nearest" ? gl.NEAREST : gl.LINEAR;
    const wrap = (w?: "clamp" | "repeat"): number =>
      w === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.samplerParameteri(h, gl.TEXTURE_MIN_FILTER, filter(desc.minFilter));
    gl.samplerParameteri(h, gl.TEXTURE_MAG_FILTER, filter(desc.magFilter));
    gl.samplerParameteri(h, gl.TEXTURE_WRAP_S, wrap(desc.wrapU));
    gl.samplerParameteri(h, gl.TEXTURE_WRAP_T, wrap(desc.wrapV));
    return new GLSampler(this, h);
  }

  createPipeline(desc: PipelineDescriptor): IPipeline {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, desc.vertexShader.glsl, "vertex");
    const fs = this.compile(gl.FRAGMENT_SHADER, desc.fragmentShader.glsl, "fragment");
    const program = gl.createProgram();
    if (!program) throw new Error("[glint] failed to create GL program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "";
      throw new Error(`[glint] program link failed: ${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("[glint] failed to create VAO");

    // Uniform introspection: map each declared uniform (possibly struct) to GLSL member names.
    const uniformLocations = new Map<string, WebGLUniformLocation>();
    const uniformTypes = new Map<string, UniformType>();
    const uniformNameMap = new Map<string, string[]>();

    for (const u of desc.uniforms) {
      uniformTypes.set(u.name, u.type);
      // In our GLSL emitter, struct uniforms are flattened to `${u.name}_${field}`.
      // We don't know field names at this layer without the full AST; the compileShader
      // result carries a flat `uniforms` list where each declared WGSL uniform is one entry,
      // but struct uniforms are represented here as the parent name. The core layer
      // passes the flattened mapping through `uniforms` directly.
      const loc = gl.getUniformLocation(program, u.name);
      if (loc) {
        uniformLocations.set(u.name, loc);
        uniformNameMap.set(u.name, [u.name]);
      } else {
        // search by prefix for flattened struct members
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
        const names: string[] = [];
        for (let i = 0; i < count; i++) {
          const info = gl.getActiveUniform(program, i);
          if (!info) continue;
          if (info.name.startsWith(u.name + "_")) {
            const l = gl.getUniformLocation(program, info.name);
            if (l) {
              uniformLocations.set(info.name, l);
              names.push(info.name);
            }
          }
        }
        uniformNameMap.set(u.name, names);
      }
    }

    // Texture bindings: map each texture name to a unit + uniform location (sampler2D).
    const textureBindings = new Map<string, { unit: number; loc: WebGLUniformLocation }>();
    let unit = 0;
    for (const t of desc.textures ?? []) {
      const loc = gl.getUniformLocation(program, t.name);
      if (loc) {
        textureBindings.set(t.name, { unit, loc });
        unit++;
      }
    }

    this.stats.pipelines++;
    const internal: GLPipelineInternal = {
      id: ++pipelineIdSeq,
      program,
      vao,
      vertexStride: desc.vertexLayout.stride,
      attributes: desc.vertexLayout.attributes,
      instanceStride: desc.instanceLayout?.stride ?? 0,
      instanceAttributes: desc.instanceLayout?.attributes ?? [],
      uniformLocations,
      uniformTypes,
      uniformNameMap,
      topology: TOPOLOGY[desc.topology] ?? gl.TRIANGLES,
      blend: desc.blend ?? "none",
      cullMode: desc.cullMode ?? "none",
      depthTest: desc.depthTest ?? false,
      textureBindings,
      samplers: desc.samplers ?? [],
      samplerToTexture: new Map(),
      destroy: () => {
        gl.deleteProgram(program);
        gl.deleteVertexArray(vao);
        this.stats.pipelines--;
      },
    };
    return internal;
  }

  private compile(
    type: number,
    source: string,
    stage: "vertex" | "fragment",
  ): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new Error("[glint] failed to create GL shader");
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? "";
      gl.deleteShader(sh);
      const { line, msg } = parseGlslLog(log);
      const err = new ShaderCompileError(
        stage,
        "webgl2",
        msg,
        hintFor(msg),
        { code: source, ...(line != null ? { line } : {}) },
      );
      if (DEV) console.error(formatShaderError(err));
      throw err;
    }
    return sh;
  }

  createCommandEncoder(): ICommandEncoder {
    return new GLCommandEncoder(this);
  }

  resetFrameStats(): void {
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
  }

  destroy(): void {
    // noop; gc handles it
  }
}

function parseGlslLog(log: string): { line?: number; msg: string } {
  // format usually: "ERROR: 0:<line>: <msg>"
  const m = log.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
  if (m) {
    return { line: parseInt(m[1]!, 10), msg: m[2]!.trim() };
  }
  return { msg: log.trim() };
}

function hintFor(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("undeclared"))
    return "This identifier wasn't declared. Check the vertex input struct or add a uniform.";
  if (m.includes("no matching"))
    return "Function signature mismatch — verify argument types.";
  if (m.includes("cannot convert"))
    return "Implicit conversion not allowed; cast explicitly, e.g. vec4(x, 0, 0, 1).";
  return "See the highlighted line above.";
}
