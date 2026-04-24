import type { IBackend } from "../backend/types.js";
import { WebGL2Backend } from "../backend/webgl2.js";
import type { Camera3D } from "../3d/camera.js";
import type { Scene3D } from "../3d/scene.js";
import type { Renderer } from "../core/renderer.js";
import { mat4Multiply } from "../core/math3d.js";

export interface XRFrameInfo {
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  viewport: { x: number; y: number; width: number; height: number };
  eye: "left" | "right" | "none";
}

export interface XRSessionHandle {
  end(): Promise<void>;
}

/**
 * Minimal WebXR session starter. Must be called from a user gesture (e.g. button click).
 *
 * Limitations:
 *  - WebGL2 backend: uses an XRWebGLLayer baseLayer; renders one pass per view (stereo).
 *  - WebGPU backend: WebXR's WebGPU binding is still shipping across vendors;
 *    glint currently throws with a clear message when used with the WebGPU backend.
 *    File an issue or wire a GPUXRProjectionLayer if your target browser supports it.
 *
 * The callback runs once per eye per frame and receives view/projection matrices + viewport.
 * The user renders their scene in the callback using the provided matrices.
 */
export async function enterXR(
  backend: IBackend,
  onXRFrame: (info: XRFrameInfo) => void,
  opts: { mode?: "immersive-vr" | "immersive-ar" } = {},
): Promise<XRSessionHandle> {
  const nav = navigator as Navigator & { xr?: XRSystem };
  if (!nav.xr) throw new Error("[glint] WebXR not available in this browser.");
  const mode = opts.mode ?? "immersive-vr";
  const supported = await nav.xr.isSessionSupported(mode);
  if (!supported) throw new Error(`[glint] WebXR mode '${mode}' not supported by this device.`);

  if (!(backend instanceof WebGL2Backend)) {
    throw new Error(
      "[glint] XR currently requires the WebGL2 backend. Call pickBackend(canvas, { force: 'webgl2' }) before enterXR.",
    );
  }

  const session = await nav.xr.requestSession(mode, {
    requiredFeatures: ["local"],
  });

  const gl = backend.gl;
  // Ensure GL is XR-compatible (this is idempotent).
  await (gl.getContextAttributes() as WebGLContextAttributes & {
    xrCompatible?: boolean;
  }).xrCompatible
    ? Promise.resolve()
    : (gl as WebGL2RenderingContext & { makeXRCompatible?: () => Promise<void> }).makeXRCompatible?.();

  const layer = new XRWebGLLayer(session, gl);
  await session.updateRenderState({ baseLayer: layer });
  const refSpace = await session.requestReferenceSpace("local");

  let frameHandle: number | null = null;

  const onFrame = (time: number, frame: XRFrame) => {
    void time;
    const pose = frame.getViewerPose(refSpace);
    if (!pose) {
      frameHandle = session.requestAnimationFrame(onFrame);
      return;
    }
    backend.externalFramebuffer = layer.framebuffer;
    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      if (!vp) continue;
      backend.externalViewport = { x: vp.x, y: vp.y, width: vp.width, height: vp.height };
      onXRFrame({
        viewMatrix: view.transform.inverse.matrix,
        projectionMatrix: view.projectionMatrix,
        viewport: { x: vp.x, y: vp.y, width: vp.width, height: vp.height },
        eye: view.eye as "left" | "right" | "none",
      });
    }
    backend.externalFramebuffer = null;
    backend.externalViewport = null;
    frameHandle = session.requestAnimationFrame(onFrame);
  };

  frameHandle = session.requestAnimationFrame(onFrame);

  return {
    async end() {
      if (frameHandle != null) session.cancelAnimationFrame(frameHandle);
      await session.end();
    },
  };
}

/**
 * High-level XR driver: renders a Scene3D in stereo to an XR session.
 * Wraps enterXR, per eye: patches the given Camera3D's view/projection from the XRView
 * and calls renderer.frame(scene.collect(camera)).
 */
export async function enterXRScene(
  backend: IBackend,
  renderer: Renderer,
  scene: Scene3D,
  camera: Camera3D,
  opts: { mode?: "immersive-vr" | "immersive-ar"; onFrame?: (dt: number) => void } = {},
): Promise<XRSessionHandle> {
  let lastTime = 0;
  return enterXR(
    backend,
    (info) => {
      camera.view.set(info.viewMatrix);
      camera.projection.set(info.projectionMatrix);
      mat4Multiply(camera.projection, camera.view, camera.viewProjection);
      if (info.eye === "left" || info.eye === "none") {
        const now = performance.now();
        const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000;
        lastTime = now;
        opts.onFrame?.(dt);
      }
      renderer.frame(scene.collect(camera, { skipCameraUpdate: true }), {
        clearColor: [0.02, 0.02, 0.04, 1],
        depth: true,
      });
    },
    opts.mode != null ? { mode: opts.mode } : {},
  );
}
