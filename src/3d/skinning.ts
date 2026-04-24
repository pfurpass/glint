import type { IBackend, ITexture, VertexLayout } from "../backend/types.js";
import { compileShader } from "../shader/compile.js";
import { Material } from "../core/mesh.js";
import { mat4Identity, mat4Invert, mat4Multiply, type Mat4, type Quat, quatSlerp } from "../core/math3d.js";
import type { Node } from "./node.js";

// pos3 + normal3 + uv2 + joints4 + weights4 = 16 floats = 64 bytes
export const SKINNED_LAYOUT: VertexLayout = {
  stride: 64,
  attributes: [
    { name: "pos", location: 0, format: "float32x3", offset: 0 },
    { name: "normal", location: 1, format: "float32x3", offset: 12 },
    { name: "uv", location: 2, format: "float32x2", offset: 24 },
    { name: "joints", location: 3, format: "float32x4", offset: 32 },
    { name: "weights", location: 4, format: "float32x4", offset: 48 },
  ],
};

const SKINNED_SHADER = `
struct VSIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) joints: vec4f,
  @location(4) weights: vec4f,
};
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldNormal: vec3f,
};
@group(0) @binding(0) var<uniform> viewProjection: mat4x4f;
@group(0) @binding(1) var<uniform> model: mat4x4f;
@group(0) @binding(2) var<uniform> lightDir: vec3f;
@group(0) @binding(3) var<uniform> lightColor: vec3f;
@group(0) @binding(4) var<uniform> ambient: vec3f;
@group(0) @binding(5) var<uniform> baseColor: vec4f;
@group(0) @binding(6) var<uniform> jointTexSize: vec2f;
@group(0) @binding(7) var jointTex: texture_2d<f32>;
@group(0) @binding(8) var jointSamp: sampler;

@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  // Read one mat4 per joint from a texture: 4 texels wide per joint.
  // joint index -> row; column = 0..3 reads one column of the mat4.
  let j0 = in.joints.x;
  let j1 = in.joints.y;
  let j2 = in.joints.z;
  let j3 = in.joints.w;
  let row0 = (j0 + 0.5) / jointTexSize.y;
  let row1 = (j1 + 0.5) / jointTexSize.y;
  let row2 = (j2 + 0.5) / jointTexSize.y;
  let row3 = (j3 + 0.5) / jointTexSize.y;
  let invW = 1.0 / jointTexSize.x;
  let bias = vec4f(8.0, 8.0, 8.0, 8.0);
  let m0c0 = textureSample(jointTex, jointSamp, vec2f(0.5 * invW, row0)) * 16.0 - bias;
  let m0c1 = textureSample(jointTex, jointSamp, vec2f(1.5 * invW, row0)) * 16.0 - bias;
  let m0c2 = textureSample(jointTex, jointSamp, vec2f(2.5 * invW, row0)) * 16.0 - bias;
  let m0c3 = textureSample(jointTex, jointSamp, vec2f(3.5 * invW, row0)) * 16.0 - bias;
  let m1c0 = textureSample(jointTex, jointSamp, vec2f(0.5 * invW, row1)) * 16.0 - bias;
  let m1c1 = textureSample(jointTex, jointSamp, vec2f(1.5 * invW, row1)) * 16.0 - bias;
  let m1c2 = textureSample(jointTex, jointSamp, vec2f(2.5 * invW, row1)) * 16.0 - bias;
  let m1c3 = textureSample(jointTex, jointSamp, vec2f(3.5 * invW, row1)) * 16.0 - bias;
  let p = vec4f(in.pos, 1.0);
  let p0 = m0c0 * p.x + m0c1 * p.y + m0c2 * p.z + m0c3 * p.w;
  let p1 = m1c0 * p.x + m1c1 * p.y + m1c2 * p.z + m1c3 * p.w;
  let skinned = p0 * in.weights.x + p1 * in.weights.y + vec4f(in.pos, 1.0) * (in.weights.z + in.weights.w);
  let world = model * skinned;
  out.pos = viewProjection * world;
  out.worldNormal = in.normal;
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

/**
 * Skinned material — reads joint matrices from a 2D texture (one row per joint, 4 texels per row storing the mat4 columns).
 * Supports up to 2 influences per vertex (common for casual characters); weights z/w fall through to bind-pose.
 */
export class SkinnedMaterial extends Material {
  baseColor: Float32Array;

  constructor(backend: IBackend, opts: { baseColor?: [number, number, number, number] } = {}) {
    const shader = compileShader(SKINNED_SHADER);
    super(backend, shader, SKINNED_LAYOUT, {
      topology: "triangle-list",
      depthTest: true,
      cullMode: "none",
    });
    this.baseColor = new Float32Array(opts.baseColor ?? [1, 1, 1, 1]);
  }
}

/** Holds joint bone references + inverse bind matrices + a CPU/GPU joint matrix buffer as texture. */
export class Skeleton {
  readonly joints: Node[];
  readonly inverseBindMatrices: Mat4[];
  readonly jointMatrixData: Float32Array;
  readonly jointTexSize: Float32Array;
  readonly jointTexture: ITexture;

  constructor(backend: IBackend, joints: Node[], inverseBindMatrices: Mat4[]) {
    this.joints = joints;
    this.inverseBindMatrices = inverseBindMatrices;
    // 4 texels per joint, RGBA float (but we only have rgba8 in milestone; pack via limited range).
    // For a usable prototype we use an rgba8 and scale values into [-8, 8]. That's crude but enough for demos.
    const width = 4;
    const height = Math.max(1, joints.length);
    this.jointTexSize = new Float32Array([width, height]);
    this.jointMatrixData = new Float32Array(height * width * 4);
    this.jointTexture = backend.createTexture(width, height, "rgba8unorm");
  }

  update(root: Node): void {
    root.updateWorld();
    const data = this.jointMatrixData;
    const joints = this.joints;
    const scratch = new Float32Array(16);
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i]!;
      mat4Multiply(j.worldMatrix, this.inverseBindMatrices[i]!, scratch);
      // pack as rgba8 in [-8, 8] range
      for (let c = 0; c < 16; c++) {
        const v = scratch[c]!;
        const clamped = Math.max(-8, Math.min(8, v));
        const norm = (clamped + 8) / 16;
        data[i * 16 + c] = norm;
      }
    }
    // upload (as Uint8 since texture is rgba8unorm)
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = Math.round(data[i]! * 255);
    this.jointTexture.upload(bytes);
  }

  destroy(): void {
    this.jointTexture.destroy();
  }
}

// ---- Animation ----

export type AnimationPath = "translation" | "rotation" | "scale";

export interface AnimationChannel {
  node: Node;
  path: AnimationPath;
  times: Float32Array;
  values: Float32Array; // length = times.length * (3 for T/S, 4 for rotation quaternion)
  interpolation: "LINEAR" | "STEP";
}

export class AnimationClip {
  channels: AnimationChannel[] = [];
  duration = 0;
}

export class AnimationPlayer {
  time = 0;
  clip: AnimationClip;
  loop = true;
  private scratchQuat: Quat = [0, 0, 0, 1];

  constructor(clip: AnimationClip) {
    this.clip = clip;
  }

  step(dt: number): void {
    this.time += dt;
    if (this.loop && this.clip.duration > 0) {
      this.time = this.time % this.clip.duration;
    }
    for (const ch of this.clip.channels) {
      const { times, values, path, node } = ch;
      const t = this.time;
      // find index
      let i = 0;
      for (; i < times.length - 1; i++) {
        if (t < times[i + 1]!) break;
      }
      const t0 = times[i]!;
      const t1 = times[Math.min(i + 1, times.length - 1)]!;
      const alpha = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
      if (path === "translation") {
        node.position[0] = lerp(values[i * 3]!, values[(i + 1) * 3]!, alpha);
        node.position[1] = lerp(values[i * 3 + 1]!, values[(i + 1) * 3 + 1]!, alpha);
        node.position[2] = lerp(values[i * 3 + 2]!, values[(i + 1) * 3 + 2]!, alpha);
      } else if (path === "scale") {
        node.scale[0] = lerp(values[i * 3]!, values[(i + 1) * 3]!, alpha);
        node.scale[1] = lerp(values[i * 3 + 1]!, values[(i + 1) * 3 + 1]!, alpha);
        node.scale[2] = lerp(values[i * 3 + 2]!, values[(i + 1) * 3 + 2]!, alpha);
      } else if (path === "rotation") {
        const a: Quat = [values[i * 4]!, values[i * 4 + 1]!, values[i * 4 + 2]!, values[i * 4 + 3]!];
        const b: Quat = [values[(i + 1) * 4]!, values[(i + 1) * 4 + 1]!, values[(i + 1) * 4 + 2]!, values[(i + 1) * 4 + 3]!];
        quatSlerp(a, b, alpha, this.scratchQuat);
        node.quaternion = [this.scratchQuat[0], this.scratchQuat[1], this.scratchQuat[2], this.scratchQuat[3]];
      }
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function computeInverseBindMatrices(joints: Node[]): Mat4[] {
  const out: Mat4[] = [];
  for (const j of joints) {
    j.updateLocal();
  }
  // Walk to compute world, then invert
  const roots = joints.filter((j) => !j.parent || !joints.includes(j.parent));
  for (const r of roots) r.updateWorld();
  for (const j of joints) {
    const inv = mat4Invert(j.worldMatrix);
    out.push(inv);
  }
  return out;
}

export { mat4Identity };
