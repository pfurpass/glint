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
import { createSceneEditor } from "glint/editor";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);
const camera = new Camera3D();
camera.position = [4, 3, 6];
renderer.autoResize((w, h) => camera.resize(w, h));

const light = new DirectionalLight({ direction: [0.4, 1, 0.6] });
const root = new Node();

const box = new Node();
box.mesh = meshFromGeometry(backend, boxGeometry(1, 1, 1));
box.material = new StandardMaterial(backend, { baseColor: [0.9, 0.4, 0.35, 1] });
box.position = [-1.5, 0.3, 0];
root.add(box);

const sph1 = new Node();
sph1.mesh = meshFromGeometry(backend, sphereGeometry(0.6, 24, 16));
sph1.material = new StandardMaterial(backend, { baseColor: [0.3, 0.8, 0.6, 1] });
sph1.position = [0.8, 0, 0];
root.add(sph1);

const sph2 = new Node();
sph2.mesh = meshFromGeometry(backend, sphereGeometry(0.4, 24, 16));
sph2.material = new StandardMaterial(backend, { baseColor: [0.3, 0.5, 1, 1] });
sph2.position = [0, 0.8, -1];
sph1.add(sph2);

const scene = new Scene3D(root, light);
const editor = createSceneEditor(scene, { title: "glint editor — click a node" });
const overlay = createDebugOverlay(backend, { corner: "top-right" });

// Demo: animate the box from code so you can watch the editor sliders follow.
renderer.loop(() => {
  const t = performance.now() / 1000;
  box.rotation[1] = t * 0.5;
  renderer.frame(scene.collect(camera), {
    clearColor: [0.04, 0.05, 0.07, 1],
    depth: true,
  });
  editor.tick();
  overlay.tick();
});
