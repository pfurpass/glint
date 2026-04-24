import type {
  IBackend,
  IBuffer,
  IPipeline,
  IndexFormat,
  PrimitiveTopology,
  UniformType,
  VertexLayout,
} from "../backend/types.js";
import type { CompiledShader } from "../shader/index.js";

function wgslToUniformType(t: string): UniformType {
  switch (t) {
    case "f32":
      return "f32";
    case "i32":
      return "i32";
    case "u32":
      return "u32";
    case "vec2f":
      return "vec2";
    case "vec3f":
      return "vec3";
    case "vec4f":
      return "vec4";
    case "mat3x3f":
      return "mat3";
    case "mat4x4f":
      return "mat4";
  }
  throw new Error(`[glint] unsupported uniform type: ${t}`);
}

export interface MeshDescriptor {
  vertices: Float32Array;
  indices?: Uint16Array | Uint32Array;
  layout: VertexLayout;
  topology?: PrimitiveTopology;
}

export class Mesh {
  readonly vertexBuffer: IBuffer;
  readonly indexBuffer?: IBuffer;
  readonly vertexCount: number;
  readonly indexCount?: number;
  readonly indexFormat?: IndexFormat;
  readonly topology: PrimitiveTopology;
  readonly layout: VertexLayout;

  constructor(backend: IBackend, desc: MeshDescriptor) {
    this.layout = desc.layout;
    this.topology = desc.topology ?? "triangle-list";
    this.vertexCount = desc.vertices.byteLength / desc.layout.stride;
    this.vertexBuffer = backend.createBuffer("vertex", desc.vertices.byteLength);
    this.vertexBuffer.write(desc.vertices);
    if (desc.indices) {
      this.indexBuffer = backend.createBuffer("index", desc.indices.byteLength);
      this.indexBuffer.write(desc.indices);
      this.indexCount = desc.indices.length;
      this.indexFormat = desc.indices instanceof Uint16Array ? "uint16" : "uint32";
    }
  }

  destroy(): void {
    this.vertexBuffer.destroy();
    this.indexBuffer?.destroy();
  }
}

export interface MaterialOptions {
  topology?: PrimitiveTopology;
  blend?: "none" | "alpha" | "additive";
  depthTest?: boolean;
  cullMode?: "none" | "back" | "front";
  instanceLayout?: VertexLayout;
}

export class Material {
  readonly pipeline: IPipeline;
  readonly expectedUniforms: string[];
  readonly expectedTextures: string[];
  readonly expectedSamplers: string[];
  constructor(
    backend: IBackend,
    readonly shader: CompiledShader,
    layout: VertexLayout,
    optsOrTopology: MaterialOptions | PrimitiveTopology = {},
    legacyBlend?: "none" | "alpha" | "additive",
  ) {
    this.expectedUniforms = shader.uniforms.map((u) => u.name);
    this.expectedTextures = shader.textures.map((t) => t.name);
    this.expectedSamplers = shader.samplers.map((s) => s.name);
    const opts: MaterialOptions =
      typeof optsOrTopology === "string"
        ? { topology: optsOrTopology, ...(legacyBlend ? { blend: legacyBlend } : {}) }
        : optsOrTopology;
    const topology = opts.topology ?? "triangle-list";
    const blend = opts.blend ?? "none";
    // Flatten struct uniforms into per-field uniform bindings so WebGL can see them,
    // while WebGPU uses the packed block layout.
    this.pipeline = backend.createPipeline({
      vertexShader: { wgsl: shader.wgsl.vertex, glsl: shader.glsl.vertex },
      fragmentShader: { wgsl: shader.wgsl.fragment, glsl: shader.glsl.fragment },
      vertexLayout: layout,
      uniforms: shader.uniforms.map((u) => ({
        name: u.name,
        binding: u.binding,
        type: wgslToUniformType(u.type as string),
      })),
      textures: shader.textures,
      samplers: shader.samplers,
      topology,
      blend,
      ...(opts.depthTest != null ? { depthTest: opts.depthTest } : {}),
      ...(opts.cullMode != null ? { cullMode: opts.cullMode } : {}),
      ...(opts.instanceLayout != null ? { instanceLayout: opts.instanceLayout } : {}),
    });
  }
  destroy(): void {
    this.pipeline.destroy();
  }
}
