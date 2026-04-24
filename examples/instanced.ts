import {
  pickBackend,
  Renderer,
  Camera2D,
  compileShader,
  Material,
  createDebugOverlay,
} from "glint/core";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);
const camera = new Camera2D();
renderer.autoResize((w, h) => camera.resize(w, h));

// Shader: per-vertex pos + per-instance offset/scale/color.
// WGSL-Subset: separate @location numbers for vertex and instance attributes.
const shader = compileShader(`
  struct VSIn {
    @location(0) pos: vec2f,
    @location(1) offset: vec2f,
    @location(2) size: vec2f,
    @location(3) color: vec4f,
  };
  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) color: vec4f,
  };
  @group(0) @binding(0) var<uniform> projection: mat4x4f;

  @vertex fn vs(in: VSIn) -> VSOut {
    var out: VSOut;
    let world = in.offset + in.pos * in.size;
    out.pos = projection * vec4f(world, 0.0, 1.0);
    out.color = in.color;
    return out;
  }
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    return in.color;
  }
`);

// Shared unit quad (2 triangles, 6 vertices, pos only)
const quad = new Float32Array([
  -0.5, -0.5,  0.5, -0.5,  0.5, 0.5,
  -0.5, -0.5,  0.5, 0.5,  -0.5, 0.5,
]);
const quadBuf = backend.createBuffer("vertex", quad.byteLength);
quadBuf.write(quad);

// Instance buffer: offset(vec2) + size(vec2) + color(vec4) = 8 floats per instance
const N = 10000;
const STRIDE = 8 * 4;
const instanceData = new Float32Array(N * 8);
const instanceBuf = backend.createBuffer("vertex", instanceData.byteLength);

const material = new Material(backend, shader, {
  stride: 8, // vertex: vec2 = 2 floats
  attributes: [{ name: "pos", location: 0, format: "float32x2", offset: 0 }],
}, {
  topology: "triangle-list",
  blend: "alpha",
  instanceLayout: {
    stride: STRIDE,
    attributes: [
      { name: "offset", location: 1, format: "float32x2", offset: 0 },
      { name: "size", location: 2, format: "float32x2", offset: 8 },
      { name: "color", location: 3, format: "float32x4", offset: 16 },
    ],
  },
});

const overlay = createDebugOverlay(backend);

renderer.loop((dt) => {
  const t = performance.now() / 1000;
  const w = canvas.width;
  const h = canvas.height;
  const cols = 100;
  const rows = N / cols;
  const cellW = w / cols;
  const cellH = h / rows;

  for (let i = 0; i < N; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = (col + 0.5) * cellW;
    const by = (row + 0.5) * cellH;
    const phase = col * 0.08 + row * 0.06 + t * 2;
    const s = (Math.sin(phase) * 0.5 + 0.5) * Math.min(cellW, cellH) * 0.9 + 2;
    const base = i * 8;
    instanceData[base + 0] = bx;
    instanceData[base + 1] = by;
    instanceData[base + 2] = s;
    instanceData[base + 3] = s;
    instanceData[base + 4] = 0.5 + 0.5 * Math.sin(phase);
    instanceData[base + 5] = 0.5 + 0.5 * Math.sin(phase + 2);
    instanceData[base + 6] = 0.5 + 0.5 * Math.sin(phase + 4);
    instanceData[base + 7] = 0.8;
  }
  instanceBuf.write(instanceData);

  renderer.frame(
    [
      {
        mesh: {
          vertexBuffer: quadBuf,
          vertexCount: 6,
          instanceBuffer: instanceBuf,
        },
        material,
        uniforms: { projection: camera.projection },
        instanceCount: N,
      },
    ],
    { clearColor: [0.03, 0.04, 0.06, 1] },
  );
  overlay.tick();
  void dt;
});
