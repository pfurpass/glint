export { Mesh, Material, type MeshDescriptor } from "./mesh.js";
export { Renderer, type RenderableItem, type FrameOptions } from "./renderer.js";
export { Camera2D } from "./camera.js";
export { textureFromURL, textureFromImage, texture1x1 } from "./texture.js";
export { compileShader, type CompiledShader } from "../shader/compile.js";
export { pickBackend } from "../backend/pick.js";
export { createDebugOverlay, type Overlay } from "../util/overlay.js";
export type {
  IBackend,
  IBuffer,
  ITexture,
  ISampler,
  IPipeline,
  VertexLayout,
  VertexAttribute,
  VertexFormat,
  PrimitiveTopology,
  UniformType,
} from "../backend/types.js";
