import type { IBackend } from "../backend/types.js";
import { compileShader } from "../shader/compile.js";
import { Material } from "../core/mesh.js";
import { VertexBatch } from "./batch.js";

const SHADER = `
struct VSIn { @location(0) pos: vec2f, @location(1) color: vec4f };
struct VSOut { @builtin(position) pos: vec4f, @location(0) color: vec4f };
@group(0) @binding(0) var<uniform> projection: mat4x4f;
@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = projection * vec4f(in.pos, 0.0, 1.0);
  out.color = in.color;
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f { return in.color; }
`;

const LAYOUT = {
  stride: 24, // vec2 + vec4 = 6 floats
  attributes: [
    { name: "pos", location: 0, format: "float32x2" as const, offset: 0 },
    { name: "color", location: 1, format: "float32x4" as const, offset: 8 },
  ],
};

export type RGBA = [number, number, number, number];

export class ShapeBatch {
  private readonly batch: VertexBatch;
  private readonly material: Material;
  private destroyed = false;

  constructor(private readonly backend: IBackend) {
    const shader = compileShader(SHADER);
    this.material = new Material(backend, shader, LAYOUT, "triangle-list", "alpha");
    this.batch = new VertexBatch(backend, LAYOUT);
  }

  begin(): void {
    this.batch.clear();
  }

  triangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: RGBA): void {
    const [r, g, b, a] = color;
    this.batch.push(ax, ay, r, g, b, a, bx, by, r, g, b, a, cx, cy, r, g, b, a);
  }

  rect(x: number, y: number, w: number, h: number, color: RGBA): void {
    const x1 = x + w;
    const y1 = y + h;
    this.triangle(x, y, x1, y, x1, y1, color);
    this.triangle(x, y, x1, y1, x, y1, color);
  }

  /** Filled circle, approximated with N segments (defaults scale with radius). */
  circle(cx: number, cy: number, radius: number, color: RGBA, segments?: number): void {
    const n = segments ?? Math.max(12, Math.min(64, Math.round(radius * 0.6)));
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a1 = i * step;
      const a2 = (i + 1) * step;
      this.triangle(
        cx,
        cy,
        cx + Math.cos(a1) * radius,
        cy + Math.sin(a1) * radius,
        cx + Math.cos(a2) * radius,
        cy + Math.sin(a2) * radius,
        color,
      );
    }
  }

  /** Polyline with constant thickness; open by default, closed=true repeats the first point. */
  line(points: ArrayLike<number>, thickness: number, color: RGBA, closed = false): void {
    const h = thickness / 2;
    const count = points.length >> 1;
    if (count < 2) return;
    const push = (i0: number, i1: number) => {
      const ax = points[i0 * 2]!,
        ay = points[i0 * 2 + 1]!;
      const bx = points[i1 * 2]!,
        by = points[i1 * 2 + 1]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const ox = nx * h;
      const oy = ny * h;
      this.triangle(ax - ox, ay - oy, bx - ox, by - oy, bx + ox, by + oy, color);
      this.triangle(ax - ox, ay - oy, bx + ox, by + oy, ax + ox, ay + oy, color);
    };
    for (let i = 0; i < count - 1; i++) push(i, i + 1);
    if (closed) push(count - 1, 0);
  }

  /** Flush the batch as a single renderable item. */
  flush(projection: Float32Array): {
    mesh: { vertexBuffer: import("../backend/types.js").IBuffer; vertexCount: number };
    material: Material;
    uniforms: Record<string, Float32Array>;
  } {
    this.batch.upload();
    return {
      mesh: {
        vertexBuffer: this.batch.buffer,
        vertexCount: this.batch.vertexCount,
      },
      material: this.material,
      uniforms: { projection },
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.batch.destroy();
    this.material.destroy();
    void this.backend;
  }
}
