import type { IBackend, ITexture } from "../backend/types.js";

export async function textureFromURL(
  backend: IBackend,
  url: string,
): Promise<ITexture> {
  const res = await fetch(url);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: "premultiply" });
  const tex = backend.createTexture(bmp.width, bmp.height, "rgba8unorm");
  tex.uploadImage(bmp);
  bmp.close();
  return tex;
}

export function textureFromImage(
  backend: IBackend,
  source: ImageBitmap | HTMLCanvasElement,
): ITexture {
  const tex = backend.createTexture(source.width, source.height, "rgba8unorm");
  tex.uploadImage(source);
  return tex;
}

export function texture1x1(
  backend: IBackend,
  r: number,
  g: number,
  b: number,
  a = 255,
): ITexture {
  const tex = backend.createTexture(1, 1, "rgba8unorm");
  tex.upload(new Uint8Array([r, g, b, a]));
  return tex;
}
