import {
  pickBackend,
  Renderer,
  Camera3D,
  boxGeometry,
  sphereGeometry,
  planeGeometry,
  meshFromGeometry,
  StandardMaterial,
  DirectionalLight,
  Node,
  Scene3D,
  createDebugOverlay,
} from "glint/3d";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);
const camera = new Camera3D();
camera.position = [4, 3, 6];
renderer.autoResize((w, h) => camera.resize(w, h));

const light = new DirectionalLight({
  direction: [0.4, 1, 0.6],
  color: [1, 0.95, 0.85],
  ambient: [0.18, 0.18, 0.22],
});

const root = new Node();

// ground plane
const ground = new Node();
ground.mesh = meshFromGeometry(backend, planeGeometry(20, 20));
ground.material = new StandardMaterial(backend, { baseColor: [0.3, 0.32, 0.36, 1] });
ground.position = [0, -0.5, 0];
root.add(ground);

// rotating box
const box = new Node();
box.mesh = meshFromGeometry(backend, boxGeometry(1, 1, 1));
box.material = new StandardMaterial(backend, { baseColor: [0.9, 0.4, 0.35, 1] });
box.position = [-1.5, 0.3, 0];
root.add(box);

// ring of spheres
const sphereGeom = sphereGeometry(0.4, 24, 16);
for (let i = 0; i < 8; i++) {
  const n = new Node();
  n.mesh = meshFromGeometry(backend, sphereGeom);
  const hue = i / 8;
  n.material = new StandardMaterial(backend, {
    baseColor: [0.5 + 0.5 * Math.sin(hue * 6.28), 0.5 + 0.5 * Math.sin(hue * 6.28 + 2), 0.5 + 0.5 * Math.sin(hue * 6.28 + 4), 1],
  });
  const a = (i / 8) * Math.PI * 2;
  n.position = [Math.cos(a) * 2.2, 0.1, Math.sin(a) * 2.2];
  root.add(n);
}

const scene = new Scene3D(root, light);
const overlay = createDebugOverlay(backend);

renderer.loop(() => {
  const t = performance.now() / 1000;
  box.rotation[1] = t * 0.7;
  box.rotation[0] = t * 0.3;
  for (let i = 0; i < 8; i++) {
    const n = root.children[1 + i]!;
    const a = t * 0.5 + (i / 8) * Math.PI * 2;
    n.position = [Math.cos(a) * 2.2, 0.1 + Math.sin(t * 2 + i) * 0.3, Math.sin(a) * 2.2];
  }
  camera.position = [Math.cos(t * 0.3) * 6, 3, Math.sin(t * 0.3) * 6];

  renderer.frame(scene.collect(camera), {
    clearColor: [0.05, 0.06, 0.09, 1],
    depth: true,
  });
  overlay.tick();
});
