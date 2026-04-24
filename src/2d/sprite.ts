import type { IBackend, ISampler, ITexture } from "../backend/types.js";
import { compileShader } from "../shader/compile.js";
import { Material } from "../core/mesh.js";
import { VertexBatch } from "./batch.js";
import type { RGBA } from "./shape.js";

const SHADER = `
struct VSIn { @location(0) pos: vec2f, @location(1) uv: vec2f, @location(2) color: vec4f };
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f };
@group(0) @binding(0) var<uniform> projection: mat4x4f;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = projection * vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  out.color = in.color;
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv) * in.color;
}
`;

const LAYOUT = {
  stride: 32, // vec2 pos + vec2 uv + vec4 color = 8 floats
  attributes: [
    { name: "pos", location: 0, format: "float32x2" as const, offset: 0 },
    { name: "uv", location: 1, format: "float32x2" as const, offset: 8 },
    { name: "color", location: 2, format: "float32x4" as const, offset: 16 },
  ],
};

export interface SpriteOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Sub-rect in normalized UV space; defaults to full texture [0,0,1,1]. */
  uv?: [number, number, number, number];
  /** Multiplicative tint; defaults to white. */
  tint?: RGBA;
  rotation?: number;
  originX?: number;
  originY?: number;
}

/**
 * Batches textured quads that share a single texture. Create one SpriteBatch per atlas.
 */
export class SpriteBatch {
  private readonly batch: VertexBatch;
  private readonly material: Material;
  private readonly sampler: ISampler;
  private destroyed = false;

  constructor(
    private readonly backend: IBackend,
    readonly texture: ITexture,
  ) {
    const shader = compileShader(SHADER);
    this.material = new Material(backend, shader, LAYOUT, "triangle-list", "alpha");
    this.batch = new VertexBatch(backend, LAYOUT);
    this.sampler = backend.createSampler({ minFilter: "linear", magFilter: "linear" });
  }

  begin(): void {
    this.batch.clear();
  }

  draw(opts: SpriteOptions): void {
    const {
      x,
      y,
      width: w,
      height: h,
      uv = [0, 0, 1, 1],
      tint = [1, 1, 1, 1],
      rotation = 0,
      originX = 0,
      originY = 0,
    } = opts;
    const [u0, v0, u1, v1] = uv;
    const [r, g, b, a] = tint;

    // Local corners relative to origin
    const lx0 = -originX * w;
    const ly0 = -originY * h;
    const lx1 = lx0 + w;
    const ly1 = ly0 + h;

    const cos = rotation !== 0 ? Math.cos(rotation) : 1;
    const sin = rotation !== 0 ? Math.sin(rotation) : 0;
    const tx = (px: number, py: number): [number, number] =>
      rotation !== 0
        ? [x + px * cos - py * sin, y + px * sin + py * cos]
        : [x + px, y + py];

    const [ax, ay] = tx(lx0, ly0);
    const [bx, by] = tx(lx1, ly0);
    const [cx, cy] = tx(lx1, ly1);
    const [dx, dy] = tx(lx0, ly1);

    // Two triangles: (a,b,c) and (a,c,d)
    const p = this.batch;
    p.push(ax, ay, u0, v0, r, g, b, a);
    p.push(bx, by, u1, v0, r, g, b, a);
    p.push(cx, cy, u1, v1, r, g, b, a);
    p.push(ax, ay, u0, v0, r, g, b, a);
    p.push(cx, cy, u1, v1, r, g, b, a);
    p.push(dx, dy, u0, v1, r, g, b, a);
  }

  flush(projection: Float32Array): {
    mesh: { vertexBuffer: import("../backend/types.js").IBuffer; vertexCount: number };
    material: Material;
    uniforms: Record<string, Float32Array>;
    textures: Record<string, ITexture>;
    samplers: Record<string, ISampler>;
  } {
    this.batch.upload();
    return {
      mesh: {
        vertexBuffer: this.batch.buffer,
        vertexCount: this.batch.vertexCount,
      },
      material: this.material,
      uniforms: { projection },
      textures: { tex: this.texture },
      samplers: { samp: this.sampler },
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.batch.destroy();
    this.material.destroy();
    this.sampler.destroy();
    void this.backend;
  }
}
