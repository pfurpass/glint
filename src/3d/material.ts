import type { IBackend } from "../backend/types.js";
import { compileShader } from "../shader/compile.js";
import { Material } from "../core/mesh.js";
import { STANDARD_LAYOUT } from "./primitives.js";

const STANDARD_SHADER = `
struct VSIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldNormal: vec3f,
  @location(1) uv: vec2f,
};
@group(0) @binding(0) var<uniform> viewProjection: mat4x4f;
@group(0) @binding(1) var<uniform> model: mat4x4f;
@group(0) @binding(2) var<uniform> normalMatrix: mat3x3f;
@group(0) @binding(3) var<uniform> lightDir: vec3f;
@group(0) @binding(4) var<uniform> lightColor: vec3f;
@group(0) @binding(5) var<uniform> ambient: vec3f;
@group(0) @binding(6) var<uniform> baseColor: vec4f;

@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let world = model * vec4f(in.pos, 1.0);
  out.pos = viewProjection * world;
  out.worldNormal = normalize(normalMatrix * in.normal);
  out.uv = in.uv;
  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let n = normalize(in.worldNormal);
  let l = normalize(lightDir);
  let ndotl = max(dot(n, l), 0.0);
  let lit = ambient + lightColor * ndotl;
  return vec4f(baseColor.rgb * lit, baseColor.a);
}
`;

export interface StandardMaterialOptions {
  baseColor?: [number, number, number, number];
}

/**
 * Lambert-shaded material with one directional light + ambient term.
 * Uses the STANDARD_LAYOUT (pos/normal/uv).
 */
export class StandardMaterial extends Material {
  baseColor: Float32Array;

  constructor(backend: IBackend, opts: StandardMaterialOptions = {}) {
    const shader = compileShader(STANDARD_SHADER);
    super(backend, shader, STANDARD_LAYOUT, {
      topology: "triangle-list",
      depthTest: true,
      cullMode: "back",
    });
    this.baseColor = new Float32Array(opts.baseColor ?? [1, 1, 1, 1]);
  }
}
