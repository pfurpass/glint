import {
  pickBackend,
  Renderer,
  Camera3D,
  boxGeometry,
  sphereGeometry,
  meshFromGeometry,
  StandardMaterial,
  DirectionalLight,
  Node,
  Scene3D,
  createDebugOverlay,
} from "glint/3d";
import { PostChain, grayscale, vignette, scanlines } from "glint/post";
import { Timeline, easeInOutCubic } from "glint/anim";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);
const camera = new Camera3D();
camera.position = [4, 3, 6];

const light = new DirectionalLight({ direction: [0.4, 1, 0.6] });
const root = new Node();
const box = new Node();
box.mesh = meshFromGeometry(backend, boxGeometry(1, 1, 1));
box.material = new StandardMaterial(backend, { baseColor: [0.9, 0.4, 0.35, 1] });
box.position = [0, 0.3, 0];
root.add(box);
const sph = new Node();
sph.mesh = meshFromGeometry(backend, sphereGeometry(0.7, 32, 24));
sph.material = new StandardMaterial(backend, { baseColor: [0.3, 0.7, 1, 1] });
sph.position = [-2, 0.2, 0];
root.add(sph);

const scene = new Scene3D(root, light);

let postChain: PostChain | null = null;
const rebuild = (w: number, h: number) => {
  postChain?.destroy();
  postChain = new PostChain(backend, w, h);
  postChain.add(grayscale(backend));
  postChain.add(vignette(backend, 0.7));
  postChain.add(scanlines(backend, h * 0.5, 0.12));
  camera.resize(w, h);
};
renderer.autoResize(rebuild);

const tl = new Timeline();
// Animate the box position + colour as a demo of the timeline module.
tl.tween(box.position as unknown as { 0: number; 1: number; 2: number }, {
  to: { 0: 2, 1: 1.2, 2: 0 },
  duration: 1500,
  easing: easeInOutCubic,
  yoyo: true,
  repeat: -1,
});
tl.tween(box.material!.baseColor as unknown as { 0: number; 1: number; 2: number; 3: number }, {
  to: { 0: 0.3, 1: 0.9, 2: 0.5, 3: 1 },
  duration: 2500,
  easing: easeInOutCubic,
  yoyo: true,
  repeat: -1,
});

const overlay = createDebugOverlay(backend);

renderer.loop((dt) => {
  tl.step(dt);
  const t = performance.now() / 1000;
  box.rotation[1] = t * 0.6;
  sph.rotation[1] = t * 0.3;
  camera.position = [Math.cos(t * 0.3) * 6, 3, Math.sin(t * 0.3) * 6];

  // Render scene into the first ping target of the chain
  renderer.frame(scene.collect(camera), {
    clearColor: [0.05, 0.06, 0.09, 1],
    depth: true,
    target: postChain!.sceneTarget,
  });
  postChain!.present(renderer);
  overlay.tick();
});
