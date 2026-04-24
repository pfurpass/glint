# glint

A unified WebGPU/WebGL2 renderer for the browser. One API, one shader language, one set of user code — automatic backend selection at runtime with no feature asymmetry.

Covers 2D graphics, data visualization, and simple 3D scenes. Not a game engine: no physics, audio, timelines, or scene editor.

```ts
import { pickBackend, compileShader, Mesh, Material, Renderer } from "glint/core";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
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
```

That's a triangle. 15 lines. Runs on WebGPU or WebGL2, same code, same output.

## Why

Three.js and Babylon.js are excellent, but their WebGPU renderers are bolt-ons with a different feature matrix from their WebGL2 renderers. `glint` is built from day one against a single backend interface that both WebGPU and WebGL2 implement in full — what you use on one, you get on the other.

## Features

- **Unified backend** — `pickBackend(canvas)` returns a `IBackend` with identical semantics for `createBuffer`, `createTexture`, `createSampler`, `createPipeline`, `createRenderTarget`, and a `CommandEncoder`. WebGPU and WebGL2 pass the same draw calls.
- **One shader language** — write once in a WGSL subset. Glint parses it and emits both WGSL (for WebGPU) and GLSL ES 3.00 (for WebGL2).
- **MSAA 4x** in both backends.
- **Instanced rendering** — per-instance vertex buffer with `stepMode: "instance"` (WebGPU) or `vertexAttribDivisor` (WebGL2). 10,000 animated quads in one draw call.
- **Depth & RenderTargets** — offscreen rendering with the same API on both backends.
- **Debug overlay** — FPS, draw calls, triangles, pipelines, buffers, textures, GPU-memory estimate. Interactive controls to isolate a single draw call or log every backend call.
- **Clear errors** — shader compile failures are shown with stage, backend, line, source snippet, caret, and a human-readable hint. Render-state validation in DEV mode names the missing uniform/texture/sampler before the draw is issued.
- **Tree-shaken bundles** — the 2D core is ~15 KB gzipped. Importing `glint/2d` does not pull in the 3D matrix code. Measure with `npm run size`.
- **ESM-only, zero runtime dependencies, first-class TypeScript**. Works without a build tool; benefits from Vite/esbuild.

## Packages

Import only what you need:

| Entry point       | What you get                                                    |
|-------------------|------------------------------------------------------------------|
| `glint`           | everything                                                       |
| `glint/core`      | `Renderer`, `Mesh`, `Material`, `Camera2D`, `compileShader`, `pickBackend`, debug overlay |
| `glint/2d`        | `ShapeBatch`, `SpriteBatch`, `VertexBatch` + all of core         |
| `glint/3d`        | `Camera3D`, `Node`, `Scene3D`, `StandardMaterial`, `DirectionalLight`, `boxGeometry`, `sphereGeometry`, `planeGeometry`, mat4 math |
| `glint/viz`       | `Chart` (scatter / line / bars / axes), `linearScale`, `niceTicks` |
| `glint/anim`      | `Timeline`, easing functions (tween any numeric field)            |
| `glint/post`      | `PostChain`, `PostEffect`, built-ins: `grayscale`, `vignette`, `scanlines`, `blur`, `bloom`, `chromaticAberration`, `filmGrain`, `pixelate`, `invert`, `toneMap`, `edgeDetect`, `colorGrade` |
| `glint/xr`        | `enterXR`, `enterXRScene` — WebXR session + stereo Scene3D rendering |
| `glint/gltf`      | `loadGltf` — reads `.glb`/`.gltf`, **including skeletal animation** (joints + inverse bind matrices + keyframe animations, quaternion TRS) |
| `glint/physics`   | `PhysicsWorld` — impulse-based 2D physics with circle/AABB colliders, gravity, restitution, friction |
| `glint/audio`     | `AudioEngine` — Web Audio wrapper with 3D positional sound, procedural tones, master bus |
| `glint/editor`    | `createSceneEditor` — in-browser panel that lists Scene3D nodes + sliders for position/rotation/scale + color picker |
| `glint/shader`    | `compileShader`, `parseShader`, WGSL/GLSL emitters               |
| `glint/backend`   | `IBackend`, `WebGPUBackend`, `WebGL2Backend`, `pickBackend`      |

## Architecture

Three layers, strict dependencies pointing inward:

- **Backend layer** (`src/backend/`) — `WebGPUBackend` and `WebGL2Backend` implement the same `IBackend` interface. All feature detection and API-difference flattening lives here.
- **Core layer** (`src/core/`) — `Mesh`, `Material`, `Renderer`, `Camera2D`, texture helpers, mat4 math, shader compiler. Talks only to `IBackend`.
- **Domain layer** — `src/2d/`, `src/3d/`, `src/viz/`. Optional, separately importable, built on top of core.

## Examples

With `npm install` and `npm run dev`:

| Route              | What it shows                                                     |
|--------------------|--------------------------------------------------------------------|
| `/`                | 15-line triangle (baseline test)                                   |
| `/scene2d.html`    | 300 particles + polyline + shapes via `ShapeBatch` + `SpriteBatch` |
| `/scene3d.html`    | Box + 8 spheres + ground plane with Lambert lighting               |
| `/dataviz.html`    | 3-panel chart: 50k scatter, line, bars                             |
| `/instanced.html`  | 10,000 animated quads in a single draw call                        |
| `/post.html`       | 3D scene through a post-processing chain (grayscale + vignette + scanlines), timeline-animated |
| `/physics.html`    | 80+ balls with gravity, collision, sound-on-impact; click to spawn more |
| `/editor.html`     | 3D scene with the in-browser node editor panel (pick a node, drag sliders) |

Every example runs on both backends. To force a backend for testing:

```ts
const backend = await pickBackend(canvas, { force: "webgl2" });
// or { prefer: "webgl2" } for "try WebGL2 first, fall back to WebGPU"
```

## Shader DSL

Glint accepts a subset of WGSL and emits both WGSL and GLSL ES 3.00:

```wgsl
struct VSIn  { @location(0) pos: vec2f, @location(1) color: vec3f };
struct VSOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };
@group(0) @binding(0) var<uniform> projection: mat4x4f;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = projection * vec4f(in.pos, 0.0, 1.0);
  out.color = in.color;
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, vec2f(0.0, 0.0)) * vec4f(in.color, 1.0);
}
```

Supported today: scalars (`f32`/`i32`/`u32`/`bool`), vectors (`vec2f`/`vec3f`/`vec4f`), matrices (`mat3x3f`/`mat4x4f`), textures (`texture_2d<f32>`), samplers, `@vertex`/`@fragment`/`@location`/`@builtin(position)`, arithmetic + comparison + logical ops, `if`/`else`/`for`, compound assignments (`+=` etc.), struct I/O, **struct-typed uniforms** (flattened into per-field bindings automatically), `textureSample`.

Not yet: storage buffers, compute shaders.

## Debug

```ts
import { createDebugOverlay } from "glint/core";
const overlay = createDebugOverlay(backend, { corner: "top-right" });

renderer.loop(() => {
  renderer.frame(items);
  overlay.tick();
});
```

In the overlay:

- **isolate #** — enter an integer N to render only draw-call N; leave `-1` to render all. Lets you binary-search which draw is broken without touching user code.
- **log backend calls** — console-logs every `draw` with pipeline id, vertex count, index count. Off by default; zero overhead when off.

Validation runs in `process.env.NODE_ENV !== "production"`. `esbuild --define:process.env.NODE_ENV='"production"'` strips it.

## Bundle size

```bash
$ npm run size

bundle sizes (esbuild --minify, single-file tree-shaken):

  entry           min       gzip
  -------------   --------  --------
  glint/core      45.1 KB   13.8 KB
  glint/2d        48.9 KB   15.0 KB
  glint/3d        54.9 KB   17.4 KB
  glint/viz       48.5 KB   15.2 KB
  glint/anim       1.7 KB     884 B
  glint/post      47.7 KB   14.2 KB
  glint/xr        14.1 KB    5.2 KB
  glint/physics    2.3 KB     888 B
  glint/audio      2.1 KB     844 B
  glint/editor     4.2 KB     1.5 KB
  glint/shader    15.3 KB   4.8 KB
  glint/backend   22.6 KB   6.9 KB
  glint (all)     45.2 KB   13.9 KB
```

The 2D core ships at 15 KB gzipped — well under the 50 KB budget — with no 3D matrix code included.

## Scope

All modules are opt-in, separately importable, tree-shakable:

- **glTF loader with skinning** — `glint/gltf` / `glint/3d`. Reads `.glb` and `.gltf`, extracts positions/normals/UVs/indices, `baseColorFactor`, skins (joints + inverse bind matrices), and animations. Includes `SkinnedMaterial`, `Skeleton`, `AnimationPlayer` with quaternion slerp and keyframe sampling.
- **Timeline / tweens** — `glint/anim`. 884 bytes gzipped. Tweens any numeric property or `number[]` slot with easing, repeat, yoyo, delay.
- **Post-processing (12 built-in effects)** — `glint/post`. Ping-pong `PostChain` with `grayscale`, `vignette`, `scanlines`, `blur`, `bloom`, `chromaticAberration`, `filmGrain`, `pixelate`, `invert`, `toneMap`, `edgeDetect`, `colorGrade`. Write your own by passing a fragment body to `PostEffect`.
- **WebXR** — `glint/xr`. `enterXR()` for a raw per-eye callback, `enterXRScene()` to drive a Scene3D directly in stereo. WebGL2 backend (WebXR↔WebGPU binding is still rolling out).
- **2D physics** — `glint/physics`. Impulse-based `PhysicsWorld` with circle/AABB colliders, gravity, restitution, friction, collision callbacks. 888 bytes gzipped.
- **Audio** — `glint/audio`. Web Audio wrapper with 3D positional `PannerNode`-based playback, procedural tone generator, master-gain mixer. 844 bytes gzipped.
- **Visual editor** — `glint/editor`. In-browser panel that reads a `Scene3D`, lists nodes, and exposes sliders for position/rotation/scale + a color picker for base colour. 1.5 KB gzipped.

### Explicit non-goal

- **Compute shaders** — WebGL2 has no compute-shader stage. A WebGPU-only compute path would break the "same API, same results on both backends" contract. Not provided.

## Install & develop

```bash
npm install
npm run dev       # Vite dev server with all examples
npm run typecheck # tsc --noEmit
npm run test      # unit tests (node --test + tsx)
npm run build     # emit dist/ for publishing
npm run size      # measure per-entry-point gzip size
```

Requires Node 18+ and a browser with WebGPU or WebGL2 (Chrome, Firefox, Safari all qualify in 2026).

## License

Apache
