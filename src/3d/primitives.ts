import type { IBackend, VertexLayout } from "../backend/types.js";
import { Mesh } from "../core/mesh.js";

export const STANDARD_LAYOUT: VertexLayout = {
  stride: 32, // vec3 pos + vec3 normal + vec2 uv = 8 floats
  attributes: [
    { name: "pos", location: 0, format: "float32x3", offset: 0 },
    { name: "normal", location: 1, format: "float32x3", offset: 12 },
    { name: "uv", location: 2, format: "float32x2", offset: 24 },
  ],
};

export interface Geometry {
  vertices: Float32Array;
  indices: Uint16Array;
  layout: VertexLayout;
}

export function boxGeometry(w = 1, h = 1, d = 1): Geometry {
  const x = w / 2, y = h / 2, z = d / 2;
  // 6 faces, 4 verts per face: pos.x3 normal.x3 uv.x2
  const faces: Array<[
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number], // normal
  ]> = [
    // +X
    [[+x,-y,-z],[+x,+y,-z],[+x,+y,+z],[+x,-y,+z],[+1,0,0]],
    // -X
    [[-x,-y,+z],[-x,+y,+z],[-x,+y,-z],[-x,-y,-z],[-1,0,0]],
    // +Y
    [[-x,+y,-z],[-x,+y,+z],[+x,+y,+z],[+x,+y,-z],[0,+1,0]],
    // -Y
    [[+x,-y,-z],[+x,-y,+z],[-x,-y,+z],[-x,-y,-z],[0,-1,0]],
    // +Z
    [[+x,-y,+z],[+x,+y,+z],[-x,+y,+z],[-x,-y,+z],[0,0,+1]],
    // -Z
    [[-x,-y,-z],[-x,+y,-z],[+x,+y,-z],[+x,-y,-z],[0,0,-1]],
  ];
  const verts: number[] = [];
  const idx: number[] = [];
  const uvs: [number, number][] = [[0,0],[0,1],[1,1],[1,0]];
  let base = 0;
  for (const face of faces) {
    const n = face[4];
    for (let i = 0; i < 4; i++) {
      const p = face[i] as [number, number, number];
      const uv = uvs[i]!;
      verts.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idx),
    layout: STANDARD_LAYOUT,
  };
}

export function planeGeometry(w = 1, d = 1, segX = 1, segY = 1): Geometry {
  const verts: number[] = [];
  const idx: number[] = [];
  const hx = w / 2, hd = d / 2;
  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const u = i / segX, v = j / segY;
      verts.push(-hx + u * w, 0, -hd + v * d, 0, 1, 0, u, v);
    }
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i;
      const b = a + 1;
      const c = a + (segX + 1);
      const d2 = c + 1;
      idx.push(a, c, b, b, c, d2);
    }
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idx),
    layout: STANDARD_LAYOUT,
  };
}

export function sphereGeometry(radius = 1, segU = 24, segV = 16): Geometry {
  const verts: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    const phi = v * Math.PI;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      verts.push(nx * radius, ny * radius, nz * radius, nx, ny, nz, u, v);
    }
  }
  const row = segU + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idx),
    layout: STANDARD_LAYOUT,
  };
}

export function meshFromGeometry(backend: IBackend, g: Geometry): Mesh {
  return new Mesh(backend, {
    vertices: g.vertices,
    indices: g.indices,
    layout: g.layout,
    topology: "triangle-list",
  });
}
