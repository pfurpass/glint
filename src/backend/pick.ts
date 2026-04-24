import type { IBackend, BackendKind } from "./types.js";
import { WebGPUBackend } from "./webgpu.js";
import { WebGL2Backend } from "./webgl2.js";

export interface PickOptions {
  prefer?: BackendKind;
  force?: BackendKind;
}

export async function pickBackend(
  canvas: HTMLCanvasElement,
  options: PickOptions = {},
): Promise<IBackend> {
  const prefer = options.prefer ?? "webgpu";
  const force = options.force;

  if (force === "webgl2") {
    const b = WebGL2Backend.create(canvas);
    if (!b) throw new Error("[glint] WebGL2 not supported");
    return b;
  }
  if (force === "webgpu") {
    const b = await WebGPUBackend.create(canvas);
    if (!b) throw new Error("[glint] WebGPU not supported");
    return b;
  }

  if (prefer === "webgpu") {
    const b = await WebGPUBackend.create(canvas);
    if (b) return b;
  }
  const gl = WebGL2Backend.create(canvas);
  if (gl) return gl;

  if (prefer !== "webgpu") {
    const b = await WebGPUBackend.create(canvas);
    if (b) return b;
  }
  throw new Error("[glint] neither WebGPU nor WebGL2 is available in this environment");
}
