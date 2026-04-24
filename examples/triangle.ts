import { pickBackend, compileShader, Mesh, Material, Renderer } from "glint/core";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas, { prefer: "webgl2" });
const shader = compileShader(`
  struct VSIn { @location(0) pos: vec2f, @location(1) color: vec3f };
  struct VSOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };
  @vertex fn vs(in: VSIn) -> VSOut { var out: VSOut; out.pos = vec4f(in.pos, 0.0, 1.0); out.color = in.color; return out; }
  @fragment fn fs(in: VSOut) -> @location(0) vec4f { return vec4f(in.color, 1.0); }
`);
const mesh = new Mesh(backend, { vertices: new Float32Array([ 0,0.8, 1,0,0,  -0.8,-0.6, 0,1,0,  0.8,-0.6, 0,0,1 ]), layout: { stride: 20, attributes: [{name:"pos",location:0,format:"float32x2",offset:0},{name:"color",location:1,format:"float32x3",offset:8}] } });
const material = new Material(backend, shader, mesh.layout);
const renderer = new Renderer(backend);
renderer.autoResize();
renderer.loop(() => renderer.frame([{ mesh, material, uniforms: {} }], { clearColor: [0.07, 0.07, 0.08, 1] }));
document.getElementById("info")!.textContent = `backend: ${backend.kind}`;
