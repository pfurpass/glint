import type {
  IBackend,
  IBuffer,
  IRenderTarget,
  IndexFormat,
  ITexture,
  ISampler,
} from "../backend/types.js";
import type { Material } from "./mesh.js";
import { DEV } from "../util/env.js";
import { GlintError } from "../util/errors.js";

export interface RenderableMesh {
  vertexBuffer: IBuffer;
  vertexCount: number;
  indexBuffer?: IBuffer;
  indexCount?: number;
  indexFormat?: IndexFormat;
  instanceBuffer?: IBuffer;
}

export interface RenderableItem {
  mesh: RenderableMesh;
  material: Material;
  uniforms: Record<string, Float32Array | Int32Array | Uint32Array>;
  textures?: Record<string, ITexture>;
  samplers?: Record<string, ISampler>;
  instanceCount?: number;
}

export interface FrameOptions {
  clearColor?: [number, number, number, number];
  clearDepth?: number;
  depth?: boolean;
  target?: IRenderTarget;
}

export class Renderer {
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dpr: number;

  constructor(readonly backend: IBackend) {
    this.dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  }

  /** Auto-sync canvas pixel size to CSS size * DPR. Call once; stop with destroy(). */
  autoResize(onResize?: (w: number, h: number) => void): void {
    const canvas = this.backend.canvas;
    const apply = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * this.dpr));
      const h = Math.max(1, Math.floor(rect.height * this.dpr));
      if (canvas.width !== w || canvas.height !== h) {
        this.backend.resize(w, h);
        onResize?.(w, h);
      }
    };
    apply();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(apply);
      this.resizeObserver.observe(canvas);
    }
    window.addEventListener("resize", apply);
  }

  frame(items: Iterable<RenderableItem>, opts: FrameOptions = {}): void {
    this.backend.resetFrameStats();
    const enc = this.backend.createCommandEncoder();
    const clearColor = opts.clearColor ?? [0, 0, 0, 1];
    enc.beginPass({
      clearColor,
      ...(opts.clearDepth != null ? { clearDepth: opts.clearDepth } : {}),
      ...(opts.depth != null ? { depth: opts.depth } : {}),
      ...(opts.target != null ? { target: opts.target } : {}),
    });
    for (const item of items) {
      if (DEV) validateItem(item);
      enc.draw({
        pipeline: item.material.pipeline,
        vertexBuffer: item.mesh.vertexBuffer,
        ...(item.mesh.indexBuffer != null
          ? { indexBuffer: item.mesh.indexBuffer }
          : {}),
        ...(item.mesh.indexFormat != null
          ? { indexFormat: item.mesh.indexFormat }
          : {}),
        vertexCount: item.mesh.vertexCount,
        ...(item.mesh.instanceBuffer != null
          ? { instanceBuffer: item.mesh.instanceBuffer }
          : {}),
        ...(item.mesh.indexCount != null
          ? { indexCount: item.mesh.indexCount }
          : {}),
        uniforms: item.uniforms,
        ...(item.textures != null ? { textures: item.textures } : {}),
        ...(item.samplers != null ? { samplers: item.samplers } : {}),
        ...(item.instanceCount != null
          ? { instanceCount: item.instanceCount }
          : {}),
      });
    }
    enc.endPass();
    enc.submit();
  }

  loop(draw: (dt: number) => void): () => void {
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      draw(dt);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
    return () => {
      if (this.rafId != null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    };
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.backend.destroy();
  }
}

function validateItem(item: RenderableItem): void {
  const mat = item.material;
  for (const name of mat.expectedUniforms) {
    if (!(name in item.uniforms)) {
      throw new GlintError(
        `Missing uniform '${name}' on render item`,
        `The material's shader declares '${name}' as a uniform; pass it in item.uniforms. Declared uniforms: ${mat.expectedUniforms.join(", ")}`,
      );
    }
  }
  for (const name of mat.expectedTextures) {
    if (!item.textures || !(name in item.textures)) {
      throw new GlintError(
        `Missing texture '${name}' on render item`,
        `The material's shader declares '${name}' as a texture; pass it in item.textures. Declared textures: ${mat.expectedTextures.join(", ") || "(none)"}`,
      );
    }
  }
  for (const name of mat.expectedSamplers) {
    if (!item.samplers || !(name in item.samplers)) {
      throw new GlintError(
        `Missing sampler '${name}' on render item`,
        `The material's shader declares '${name}' as a sampler; pass it in item.samplers. Declared samplers: ${mat.expectedSamplers.join(", ") || "(none)"}`,
      );
    }
  }
  if (item.mesh.vertexCount <= 0 && !item.mesh.indexCount) {
    throw new GlintError(
      "Render item has zero vertices",
      "Empty meshes waste a pipeline switch; guard this branch at the call site.",
    );
  }
}
