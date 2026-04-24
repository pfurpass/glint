import {
  pickBackend,
  Renderer,
  Camera2D,
  ShapeBatch,
  createDebugOverlay,
} from "glint/2d";
import { PhysicsWorld } from "glint/physics";
import { AudioEngine } from "glint/audio";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);
const camera = new Camera2D();
const shapes = new ShapeBatch(backend);
const overlay = createDebugOverlay(backend);

const world = new PhysicsWorld();
world.gravity[1] = 900;

const audio = new AudioEngine();
const bounceSound = audio.tone(0.08, 520);

function makeBall(x: number, y: number) {
  const r = 8 + Math.random() * 16;
  world.add({
    position: [x, y],
    velocity: [(Math.random() - 0.5) * 200, -100 + Math.random() * -200],
    mass: r * r,
    restitution: 0.5,
    friction: 0.1,
    collider: { kind: "circle", radius: r },
    userData: { color: [Math.random() * 0.6 + 0.4, Math.random() * 0.6 + 0.4, Math.random() * 0.6 + 0.4, 1] as [number, number, number, number] },
  });
}

function makeWalls(w: number, h: number) {
  // floor
  world.add({
    position: [w / 2, h - 20],
    velocity: [0, 0],
    mass: 0,
    restitution: 0.4,
    friction: 0,
    collider: { kind: "aabb", halfWidth: w / 2, halfHeight: 20 },
    userData: { color: [0.25, 0.27, 0.32, 1] as [number, number, number, number] },
  });
  // left
  world.add({
    position: [20, h / 2],
    velocity: [0, 0],
    mass: 0,
    restitution: 0.4,
    friction: 0,
    collider: { kind: "aabb", halfWidth: 20, halfHeight: h / 2 },
    userData: { color: [0.25, 0.27, 0.32, 1] as [number, number, number, number] },
  });
  // right
  world.add({
    position: [w - 20, h / 2],
    velocity: [0, 0],
    mass: 0,
    restitution: 0.4,
    friction: 0,
    collider: { kind: "aabb", halfWidth: 20, halfHeight: h / 2 },
    userData: { color: [0.25, 0.27, 0.32, 1] as [number, number, number, number] },
  });
}

renderer.autoResize((w, h) => {
  camera.resize(w, h);
  // rebuild static walls
  world.bodies.length = 0;
  makeWalls(w, h);
  for (let i = 0; i < 80; i++) {
    makeBall(Math.random() * w, Math.random() * h * 0.5);
  }
});

world.onCollision = (ev) => {
  // rough spatial audio tied to collision position
  const speed = Math.hypot(
    ev.a.velocity[0] - ev.b.velocity[0],
    ev.a.velocity[1] - ev.b.velocity[1],
  );
  if (speed > 150 && ev.a.mass > 0 && ev.b.mass > 0) {
    audio.play(bounceSound, { volume: Math.min(0.3, speed / 1200) });
  }
};

canvas.addEventListener("click", async (e) => {
  await audio.resume();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  for (let i = 0; i < 10; i++) makeBall(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40);
});

renderer.loop((dt) => {
  world.step(Math.min(dt, 1 / 30));
  shapes.begin();
  for (const b of world.bodies) {
    const color = (b.userData as { color: [number, number, number, number] }).color;
    if (b.collider.kind === "circle") {
      shapes.circle(b.position[0], b.position[1], b.collider.radius, color, 20);
    } else {
      shapes.rect(
        b.position[0] - b.collider.halfWidth,
        b.position[1] - b.collider.halfHeight,
        b.collider.halfWidth * 2,
        b.collider.halfHeight * 2,
        color,
      );
    }
  }
  renderer.frame([shapes.flush(camera.projection)], { clearColor: [0.05, 0.06, 0.09, 1] });
  overlay.tick();
});
