export type BackendKind = "webgpu" | "webgl2";

export type VertexFormat =
  | "float32"
  | "float32x2"
  | "float32x3"
  | "float32x4"
  | "uint16"
  | "uint16x2"
  | "uint16x4"
  | "uint32";

export type IndexFormat = "uint16" | "uint32";

export type PrimitiveTopology =
  | "triangle-list"
  | "triangle-strip"
  | "line-list"
  | "line-strip"
  | "point-list";

export type UniformType =
  | "f32"
  | "vec2"
  | "vec3"
  | "vec4"
  | "mat3"
  | "mat4"
  | "i32"
  | "u32";

export interface VertexAttribute {
  name: string;
  location: number;
  format: VertexFormat;
  offset: number;
}

export interface VertexLayout {
  stride: number;
  attributes: VertexAttribute[];
}

export interface UniformBinding {
  name: string;
  binding: number;
  type: UniformType;
}

export interface TextureBinding {
  name: string;
  binding: number;
}

export interface SamplerBinding {
  name: string;
  binding: number;
}

export interface PipelineDescriptor {
  vertexShader: { wgsl: string; glsl: string };
  fragmentShader: { wgsl: string; glsl: string };
  vertexLayout: VertexLayout;
  /** Optional per-instance vertex layout; advances once per instance instead of per vertex. */
  instanceLayout?: VertexLayout;
  uniforms: UniformBinding[];
  textures?: TextureBinding[];
  samplers?: SamplerBinding[];
  topology: PrimitiveTopology;
  blend?: "none" | "alpha" | "additive";
  depthTest?: boolean;
  cullMode?: "none" | "back" | "front";
}

export interface IBuffer {
  readonly byteLength: number;
  write(data: ArrayBufferView, offset?: number): void;
  destroy(): void;
}

export type TextureFormat = "rgba8unorm" | "r8unorm" | "depth24plus";

export interface ITexture {
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  upload(data: ArrayBufferView): void;
  uploadImage(source: ImageBitmap | HTMLCanvasElement): void;
  destroy(): void;
}

export interface ISampler {
  readonly id: number;
  destroy(): void;
}

export interface SamplerDescriptor {
  minFilter?: "nearest" | "linear";
  magFilter?: "nearest" | "linear";
  wrapU?: "clamp" | "repeat";
  wrapV?: "clamp" | "repeat";
}

export interface IPipeline {
  readonly id: number;
  destroy(): void;
}

export interface DrawCall {
  pipeline: IPipeline;
  vertexBuffer: IBuffer;
  /** Per-instance vertex buffer; required when pipeline has an instanceLayout. */
  instanceBuffer?: IBuffer;
  indexBuffer?: IBuffer;
  indexFormat?: IndexFormat;
  vertexCount: number;
  indexCount?: number;
  uniforms: Record<string, Float32Array | Int32Array | Uint32Array>;
  textures?: Record<string, ITexture>;
  samplers?: Record<string, ISampler>;
  instanceCount?: number;
}

export interface RenderPassDescriptor {
  clearColor?: [number, number, number, number];
  clearDepth?: number;
  depth?: boolean;
  /** Optional render target; if omitted, renders to the canvas. */
  target?: IRenderTarget;
}

export interface IRenderTarget {
  readonly width: number;
  readonly height: number;
  readonly colorTexture: ITexture;
  destroy(): void;
}

export interface ICommandEncoder {
  beginPass(desc: RenderPassDescriptor): void;
  draw(call: DrawCall): void;
  endPass(): void;
  submit(): void;
}

export interface IBackend {
  readonly kind: BackendKind;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;

  createBuffer(
    usage: "vertex" | "index" | "uniform",
    size: number,
  ): IBuffer;
  createTexture(
    width: number,
    height: number,
    format: TextureFormat,
  ): ITexture;
  createSampler(desc?: SamplerDescriptor): ISampler;
  createPipeline(desc: PipelineDescriptor): IPipeline;
  createRenderTarget(width: number, height: number): IRenderTarget;

  createCommandEncoder(): ICommandEncoder;

  resize(width: number, height: number): void;
  destroy(): void;

  readonly stats: {
    drawCalls: number;
    triangles: number;
    pipelines: number;
    buffers: number;
    textures: number;
    /** Approximate GPU memory in bytes (buffers + textures). */
    bytes: number;
  };
  resetFrameStats(): void;

  /** Dev debug hooks. No-op in production. */
  debug: {
    /** When set, only this 0-based draw-call index within the pass is executed. */
    isolateDraw: number | null;
    /** When true, every backend call logs to console.debug. */
    logCalls: boolean;
  };
}
