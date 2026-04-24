// Minimal ambient WebXR types (subset used by glint/xr). Real apps should use @types/webxr.

interface XRSystem {
  isSessionSupported(mode: "immersive-vr" | "immersive-ar" | "inline"): Promise<boolean>;
  requestSession(
    mode: "immersive-vr" | "immersive-ar" | "inline",
    options?: { requiredFeatures?: string[]; optionalFeatures?: string[] },
  ): Promise<XRSession>;
}

interface XRSession {
  updateRenderState(state: { baseLayer?: XRWebGLLayer }): Promise<void>;
  requestReferenceSpace(type: "local" | "viewer" | "local-floor"): Promise<XRReferenceSpace>;
  requestAnimationFrame(cb: (time: number, frame: XRFrame) => void): number;
  cancelAnimationFrame(handle: number): void;
  end(): Promise<void>;
}

type XRReferenceSpace = object;

interface XRFrame {
  getViewerPose(refSpace: XRReferenceSpace): XRViewerPose | null;
}

interface XRViewerPose {
  views: XRView[];
}

interface XRView {
  readonly eye: "left" | "right" | "none";
  readonly projectionMatrix: Float32Array;
  readonly transform: { readonly inverse: { readonly matrix: Float32Array } };
}

interface XRWebGLLayerInit {}

declare class XRWebGLLayer {
  constructor(session: XRSession, gl: WebGL2RenderingContext, opts?: XRWebGLLayerInit);
  readonly framebuffer: WebGLFramebuffer;
  getViewport(view: XRView): { x: number; y: number; width: number; height: number } | null;
}
