import type { IBackend } from "../backend/types.js";
import type { RenderableItem } from "../core/renderer.js";
import { Camera2D } from "../core/camera.js";
import { ShapeBatch, type RGBA } from "../2d/shape.js";
import { linearScale, niceTicks, type Scale } from "./scale.js";

export interface ChartRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Thin orchestrator that owns a ShapeBatch and knows how to draw axes.
 * Users call begin(), then any of scatter/line/axes, then flush().
 */
export class Chart {
  readonly shapes: ShapeBatch;
  readonly camera = new Camera2D();
  xScale: Scale;
  yScale: Scale;
  rect: ChartRect = { x: 0, y: 0, width: 1, height: 1 };
  background: RGBA = [0.07, 0.08, 0.1, 1];
  gridColor: RGBA = [0.18, 0.19, 0.22, 1];
  axisColor: RGBA = [0.45, 0.47, 0.52, 1];

  constructor(backend: IBackend) {
    this.shapes = new ShapeBatch(backend);
    this.xScale = linearScale([0, 1], [0, 1]);
    this.yScale = linearScale([0, 1], [1, 0]);
  }

  setRect(r: ChartRect): void {
    this.rect = r;
    this.xScale.range([r.x, r.x + r.width]);
    this.yScale.range([r.y + r.height, r.y]); // flip: Y down
  }

  setDomain(xDomain: [number, number], yDomain: [number, number]): void {
    this.xScale.domain(xDomain);
    this.yScale.domain(yDomain);
  }

  begin(): void {
    this.shapes.begin();
    this.shapes.rect(this.rect.x, this.rect.y, this.rect.width, this.rect.height, this.background);
  }

  /** Draw grid + axis labels positioned at major ticks. */
  axes(opts: { xTicks?: number; yTicks?: number } = {}): void {
    const { rect, xScale, yScale, gridColor, axisColor } = this;
    const xt = niceTicks(xScale._domain[0], xScale._domain[1], opts.xTicks ?? 6);
    const yt = niceTicks(yScale._domain[0], yScale._domain[1], opts.yTicks ?? 5);
    for (const x of xt) {
      const px = xScale(x);
      this.shapes.rect(px, rect.y, 1, rect.height, gridColor);
    }
    for (const y of yt) {
      const py = yScale(y);
      this.shapes.rect(rect.x, py, rect.width, 1, gridColor);
    }
    // axis borders
    this.shapes.rect(rect.x, rect.y + rect.height - 1, rect.width, 1, axisColor);
    this.shapes.rect(rect.x, rect.y, 1, rect.height, axisColor);
  }

  scatter(
    data: ArrayLike<number>,
    opts: { radius?: number; color?: RGBA } = {},
  ): void {
    const radius = opts.radius ?? 2;
    const color = opts.color ?? [0.4, 0.8, 1, 0.9];
    const count = data.length >> 1;
    for (let i = 0; i < count; i++) {
      const px = this.xScale(data[i * 2]!);
      const py = this.yScale(data[i * 2 + 1]!);
      this.shapes.circle(px, py, radius, color, 12);
    }
  }

  line(
    data: ArrayLike<number>,
    opts: { thickness?: number; color?: RGBA } = {},
  ): void {
    const points: number[] = [];
    const count = data.length >> 1;
    for (let i = 0; i < count; i++) {
      points.push(this.xScale(data[i * 2]!), this.yScale(data[i * 2 + 1]!));
    }
    this.shapes.line(points, opts.thickness ?? 2, opts.color ?? [1, 0.65, 0.25, 1]);
  }

  bars(
    data: ArrayLike<number>,
    opts: { width?: number; color?: RGBA; baseline?: number } = {},
  ): void {
    const color = opts.color ?? [0.5, 0.7, 1, 0.9];
    const baseline = opts.baseline ?? 0;
    const bw = opts.width ?? 6;
    const count = data.length >> 1;
    for (let i = 0; i < count; i++) {
      const x = this.xScale(data[i * 2]!);
      const y1 = this.yScale(data[i * 2 + 1]!);
      const y0 = this.yScale(baseline);
      const top = Math.min(y0, y1);
      const h = Math.abs(y1 - y0);
      this.shapes.rect(x - bw / 2, top, bw, h, color);
    }
  }

  flush(): RenderableItem {
    return this.shapes.flush(this.camera.projection);
  }

  destroy(): void {
    this.shapes.destroy();
  }
}
