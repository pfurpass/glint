import type { IBackend } from "../backend/types.js";
import { Mesh } from "../core/mesh.js";
import { STANDARD_LAYOUT, type Geometry } from "./primitives.js";
import { StandardMaterial } from "./material.js";
import { Node } from "./node.js";
import {
  AnimationClip,
  AnimationPlayer,
  Skeleton,
  SkinnedMaterial,
  SKINNED_LAYOUT,
  type AnimationChannel,
} from "./skinning.js";
import type { Mat4 } from "../core/math3d.js";

interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT3" | "MAT4";
}
interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
}
interface GltfPrimitive {
  attributes: {
    POSITION?: number;
    NORMAL?: number;
    TEXCOORD_0?: number;
    JOINTS_0?: number;
    WEIGHTS_0?: number;
  };
  indices?: number;
  material?: number;
}
interface GltfSkin {
  joints: number[];
  inverseBindMatrices?: number;
  skeleton?: number;
}
interface GltfAnimChannel {
  sampler: number;
  target: { node: number; path: "translation" | "rotation" | "scale" };
}
interface GltfAnimSampler {
  input: number;
  output: number;
  interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
}
interface GltfAnimation {
  channels: GltfAnimChannel[];
  samplers: GltfAnimSampler[];
}
interface GltfDoc {
  buffers: { byteLength: number; uri?: string }[];
  bufferViews: GltfBufferView[];
  accessors: GltfAccessor[];
  meshes: { primitives: GltfPrimitive[] }[];
  materials?: {
    pbrMetallicRoughness?: { baseColorFactor?: [number, number, number, number] };
  }[];
  nodes?: {
    mesh?: number;
    skin?: number;
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    children?: number[];
  }[];
  skins?: GltfSkin[];
  animations?: GltfAnimation[];
  scenes?: { nodes: number[] }[];
  scene?: number;
}

const CT_FLOAT = 5126;
const CT_U16 = 5123;
const CT_U32 = 5125;

function readAccessor(
  doc: GltfDoc,
  bin: Uint8Array,
  idx: number,
): { data: Float32Array | Uint16Array | Uint32Array; components: number } {
  const acc = doc.accessors[idx]!;
  const view = doc.bufferViews[acc.bufferView]!;
  const offset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT3: 9, MAT4: 16 }[acc.type];
  const byteLen = acc.count * components * (acc.componentType === CT_FLOAT ? 4 : acc.componentType === CT_U32 ? 4 : 2);
  const src = bin.slice(offset, offset + byteLen);
  if (acc.componentType === CT_FLOAT) {
    return { data: new Float32Array(src.buffer, src.byteOffset, acc.count * components), components };
  }
  if (acc.componentType === CT_U16) {
    return { data: new Uint16Array(src.buffer, src.byteOffset, acc.count), components };
  }
  if (acc.componentType === CT_U32) {
    return { data: new Uint32Array(src.buffer, src.byteOffset, acc.count), components };
  }
  throw new Error(`[glint] unsupported glTF componentType ${acc.componentType}`);
}

export interface GltfLoadResult {
  root: Node;
  meshes: Mesh[];
  materials: (StandardMaterial | SkinnedMaterial)[];
  skeletons: Skeleton[];
  animations: AnimationClip[];
  animationPlayer?: AnimationPlayer;
}

/** Parse a .glb file (ArrayBuffer) into { doc, bin }. */
function parseGlb(buf: ArrayBuffer): { doc: GltfDoc; bin: Uint8Array } {
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error("[glint] not a glb file");
  const length = dv.getUint32(8, true);
  let offset = 12;
  let doc: GltfDoc | null = null;
  let bin: Uint8Array | null = null;
  while (offset < length) {
    const chunkLen = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const data = new Uint8Array(buf, offset + 8, chunkLen);
    if (chunkType === 0x4e4f534a) {
      doc = JSON.parse(new TextDecoder().decode(data));
    } else if (chunkType === 0x004e4942) {
      bin = data;
    }
    offset += 8 + chunkLen;
  }
  if (!doc || !bin) throw new Error("[glint] glb missing JSON or BIN chunk");
  return { doc, bin };
}

async function fetchBuffer(url: string, baseUrl: string): Promise<Uint8Array> {
  if (url.startsWith("data:")) {
    const [, b64] = url.split(",");
    const bin = atob(b64!);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  const full = new URL(url, baseUrl).href;
  const res = await fetch(full);
  return new Uint8Array(await res.arrayBuffer());
}

function skinnedGeometry(
  doc: GltfDoc,
  bin: Uint8Array,
  prim: GltfPrimitive,
): Geometry {
  const pos = readAccessor(doc, bin, prim.attributes.POSITION!).data as Float32Array;
  const count = pos.length / 3;
  const norm = prim.attributes.NORMAL != null
    ? (readAccessor(doc, bin, prim.attributes.NORMAL).data as Float32Array)
    : new Float32Array(count * 3);
  const uv = prim.attributes.TEXCOORD_0 != null
    ? (readAccessor(doc, bin, prim.attributes.TEXCOORD_0).data as Float32Array)
    : new Float32Array(count * 2);
  const joints = readAccessor(doc, bin, prim.attributes.JOINTS_0!).data;
  const weights = readAccessor(doc, bin, prim.attributes.WEIGHTS_0!).data as Float32Array;

  const interleaved = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) {
    interleaved[i * 16 + 0] = pos[i * 3]!;
    interleaved[i * 16 + 1] = pos[i * 3 + 1]!;
    interleaved[i * 16 + 2] = pos[i * 3 + 2]!;
    interleaved[i * 16 + 3] = norm[i * 3]!;
    interleaved[i * 16 + 4] = norm[i * 3 + 1]!;
    interleaved[i * 16 + 5] = norm[i * 3 + 2]!;
    interleaved[i * 16 + 6] = uv[i * 2]!;
    interleaved[i * 16 + 7] = uv[i * 2 + 1]!;
    interleaved[i * 16 + 8] = joints[i * 4]!;
    interleaved[i * 16 + 9] = joints[i * 4 + 1]!;
    interleaved[i * 16 + 10] = joints[i * 4 + 2]!;
    interleaved[i * 16 + 11] = joints[i * 4 + 3]!;
    interleaved[i * 16 + 12] = weights[i * 4]!;
    interleaved[i * 16 + 13] = weights[i * 4 + 1]!;
    interleaved[i * 16 + 14] = weights[i * 4 + 2]!;
    interleaved[i * 16 + 15] = weights[i * 4 + 3]!;
  }
  let indices: Uint16Array;
  if (prim.indices != null) {
    const raw = readAccessor(doc, bin, prim.indices).data;
    if (raw instanceof Uint16Array) indices = raw;
    else indices = new Uint16Array(raw);
  } else {
    indices = new Uint16Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
  }
  return { vertices: interleaved, indices, layout: SKINNED_LAYOUT };
}

function primitiveToGeometry(
  doc: GltfDoc,
  bin: Uint8Array,
  prim: GltfPrimitive,
): Geometry {
  if (prim.attributes.POSITION == null) {
    throw new Error("[glint] glTF primitive missing POSITION attribute");
  }
  const pos = readAccessor(doc, bin, prim.attributes.POSITION).data as Float32Array;
  const count = pos.length / 3;
  const norm = prim.attributes.NORMAL != null
    ? (readAccessor(doc, bin, prim.attributes.NORMAL).data as Float32Array)
    : new Float32Array(count * 3);
  const uv = prim.attributes.TEXCOORD_0 != null
    ? (readAccessor(doc, bin, prim.attributes.TEXCOORD_0).data as Float32Array)
    : new Float32Array(count * 2);
  if (prim.attributes.NORMAL == null) {
    // default up-normal
    for (let i = 0; i < count; i++) norm[i * 3 + 1] = 1;
  }
  const interleaved = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    interleaved[i * 8 + 0] = pos[i * 3 + 0]!;
    interleaved[i * 8 + 1] = pos[i * 3 + 1]!;
    interleaved[i * 8 + 2] = pos[i * 3 + 2]!;
    interleaved[i * 8 + 3] = norm[i * 3 + 0]!;
    interleaved[i * 8 + 4] = norm[i * 3 + 1]!;
    interleaved[i * 8 + 5] = norm[i * 3 + 2]!;
    interleaved[i * 8 + 6] = uv[i * 2 + 0]!;
    interleaved[i * 8 + 7] = uv[i * 2 + 1]!;
  }
  let indices: Uint16Array;
  if (prim.indices != null) {
    const raw = readAccessor(doc, bin, prim.indices).data;
    if (raw instanceof Uint16Array) indices = raw;
    else indices = new Uint16Array(raw);
  } else {
    indices = new Uint16Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
  }
  return { vertices: interleaved, indices, layout: STANDARD_LAYOUT };
}

export async function loadGltf(
  backend: IBackend,
  url: string,
): Promise<GltfLoadResult> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let doc: GltfDoc;
  let bin: Uint8Array;
  if (url.toLowerCase().endsWith(".glb")) {
    ({ doc, bin } = parseGlb(buf));
  } else {
    doc = JSON.parse(new TextDecoder().decode(buf));
    const first = doc.buffers[0];
    if (!first?.uri) throw new Error("[glint] glTF missing buffer uri");
    bin = await fetchBuffer(first.uri, url);
  }

  const meshes: Mesh[] = [];
  const materials: (StandardMaterial | SkinnedMaterial)[] = [];
  const perMesh: { mesh: Mesh; material: StandardMaterial | SkinnedMaterial; skinned: boolean; meshIndex: number }[] = [];

  for (let mi = 0; mi < doc.meshes.length; mi++) {
    const m = doc.meshes[mi]!;
    const prim = m.primitives[0]!;
    const isSkinned = prim.attributes.JOINTS_0 != null && prim.attributes.WEIGHTS_0 != null;
    const geom = isSkinned
      ? skinnedGeometry(doc, bin, prim)
      : primitiveToGeometry(doc, bin, prim);
    const mesh = new Mesh(backend, {
      vertices: geom.vertices,
      indices: geom.indices,
      layout: geom.layout,
      topology: "triangle-list",
    });
    const matDef = prim.material != null ? doc.materials?.[prim.material] : undefined;
    const baseColor = matDef?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
    const mat = isSkinned
      ? new SkinnedMaterial(backend, { baseColor })
      : new StandardMaterial(backend, { baseColor });
    meshes.push(mesh);
    materials.push(mat);
    perMesh.push({ mesh, material: mat, skinned: isSkinned, meshIndex: mi });
  }

  // Build all nodes up-front so cross-references (skin.joints) resolve.
  const nodes: Node[] = (doc.nodes ?? []).map(() => new Node());
  if (doc.nodes) {
    for (let i = 0; i < doc.nodes.length; i++) {
      const def = doc.nodes[i]!;
      const n = nodes[i]!;
      if (def.translation) n.position = [...def.translation];
      if (def.scale) n.scale = [...def.scale];
      if (def.rotation) n.quaternion = [...def.rotation];
      if (def.mesh != null) {
        n.mesh = perMesh[def.mesh]!.mesh;
        n.material = perMesh[def.mesh]!.material;
      }
    }
    for (let i = 0; i < doc.nodes.length; i++) {
      const def = doc.nodes[i]!;
      for (const c of def.children ?? []) nodes[i]!.add(nodes[c]!);
    }
  }

  const root = new Node();
  if (doc.scenes) {
    const sceneIdx = doc.scene ?? 0;
    for (const i of doc.scenes[sceneIdx]!.nodes) root.add(nodes[i]!);
  } else {
    for (const n of nodes) if (!n.parent) root.add(n);
  }

  // Skins
  const skeletons: Skeleton[] = [];
  if (doc.skins) {
    for (const skin of doc.skins) {
      const joints = skin.joints.map((ji) => nodes[ji]!);
      let ibms: Mat4[];
      if (skin.inverseBindMatrices != null) {
        const raw = readAccessor(doc, bin, skin.inverseBindMatrices).data as Float32Array;
        ibms = [];
        for (let i = 0; i < joints.length; i++) {
          ibms.push(raw.slice(i * 16, (i + 1) * 16));
        }
      } else {
        ibms = joints.map(() => {
          const m = new Float32Array(16);
          m[0] = m[5] = m[10] = m[15] = 1;
          return m;
        });
      }
      skeletons.push(new Skeleton(backend, joints, ibms));
    }
  }

  // Animations
  const animations: AnimationClip[] = [];
  if (doc.animations) {
    for (const anim of doc.animations) {
      const clip = new AnimationClip();
      let maxDuration = 0;
      for (const ch of anim.channels) {
        const samp = anim.samplers[ch.sampler]!;
        const times = readAccessor(doc, bin, samp.input).data as Float32Array;
        const values = readAccessor(doc, bin, samp.output).data as Float32Array;
        maxDuration = Math.max(maxDuration, times[times.length - 1] ?? 0);
        const channel: AnimationChannel = {
          node: nodes[ch.target.node]!,
          path: ch.target.path,
          times,
          values,
          interpolation: samp.interpolation === "STEP" ? "STEP" : "LINEAR",
        };
        clip.channels.push(channel);
      }
      clip.duration = maxDuration;
      animations.push(clip);
    }
  }

  const result: GltfLoadResult = { root, meshes, materials, skeletons, animations };
  if (animations[0]) {
    result.animationPlayer = new AnimationPlayer(animations[0]);
  }
  return result;
}
