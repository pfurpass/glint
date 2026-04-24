import type {
  IBackend,
  IBuffer,
  VertexLayout,
} from "../backend/types.js";

/**
 * Growable CPU-side vertex buffer that mirrors into a GPU buffer on upload.
 * The vertex layout is opaque to this class — callers push raw floats in layout order.
 */
export class VertexBatch {
  private data: Float32Array;
  private len = 0;
  private gpu: IBuffer;
  private gpuCapacity: number;

  constructor(
    private readonly backend: IBackend,
    readonly layout: VertexLayout,
    initialCapacity = 256,
  ) {
    this.data = new Float32Array((initialCapacity * layout.stride) / 4);
    this.gpuCapacity = initialCapacity;
    this.gpu = backend.createBuffer("vertex", initialCapacity * layout.stride);
  }

  get vertexCount(): number {
    return (this.len * 4) / this.layout.stride;
  }
  get buffer(): IBuffer {
    return this.gpu;
  }

  clear(): void {
    this.len = 0;
  }

  push(...values: number[]): void {
    if (this.len + values.length > this.data.length) {
      const needed = this.len + values.length;
      let cap = this.data.length;
      while (cap < needed) cap *= 2;
      const bigger = new Float32Array(cap);
      bigger.set(this.data);
      this.data = bigger;
    }
    for (let i = 0; i < values.length; i++) {
      this.data[this.len + i] = values[i]!;
    }
    this.len += values.length;
  }

  /** Upload the current CPU data to the GPU buffer, growing the GPU buffer if needed. */
  upload(): void {
    const neededBytes = this.len * 4;
    const neededVerts = neededBytes / this.layout.stride;
    if (neededVerts > this.gpuCapacity) {
      this.gpu.destroy();
      let cap = this.gpuCapacity;
      while (cap < neededVerts) cap *= 2;
      this.gpu = this.backend.createBuffer("vertex", cap * this.layout.stride);
      this.gpuCapacity = cap;
    }
    if (neededBytes > 0) {
      this.gpu.write(this.data.subarray(0, this.len));
    }
  }

  destroy(): void {
    this.gpu.destroy();
  }
}
