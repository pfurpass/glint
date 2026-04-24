import {
  pickBackend,
  Camera2D,
  Renderer,
  ShapeBatch,
  SpriteBatch,
  textureFromImage,
  createDebugOverlay,
} from "glint/2d";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);
const camera = new Camera2D();
renderer.autoResize((w, h) => camera.resize(w, h));

const overlay = createDebugOverlay(backend, { corner: "top-right" });

const shapes = new ShapeBatch(backend);

// Procedural sprite texture: a soft radial gradient disc
const tex = (() => {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return textureFromImage(backend, c);
})();

const sprites = new SpriteBatch(backend, tex);

type Particle = { x: number; y: number; vx: number; vy: number; r: number; hue: [number, number, number] };
const particles: Particle[] = Array.from({ length: 300 }, () => ({
  x: Math.random() * 1000,
  y: Math.random() * 800,
  vx: (Math.random() - 0.5) * 60,
  vy: (Math.random() - 0.5) * 60,
  r: 10 + Math.random() * 20,
  hue: [0.4 + Math.random() * 0.6, 0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.2],
}));

renderer.loop((dt) => {
  const w = canvas.width;
  const h = canvas.height;

  // Background geometry via ShapeBatch
  shapes.begin();
  shapes.rect(0, 0, w, h, [0.06, 0.07, 0.1, 1]);
  // grid
  for (let x = 0; x < w; x += 64 * devicePixelRatio) {
    shapes.rect(x, 0, 1, h, [0.12, 0.13, 0.18, 1]);
  }
  for (let y = 0; y < h; y += 64 * devicePixelRatio) {
    shapes.rect(0, y, w, 1, [0.12, 0.13, 0.18, 1]);
  }
  // a polyline that snakes across the screen
  const pts: number[] = [];
  const t = performance.now() / 1000;
  for (let i = 0; i <= 80; i++) {
    const x = (i / 80) * w;
    const y = h / 2 + Math.sin(i * 0.25 + t) * 120 * devicePixelRatio;
    pts.push(x, y);
  }
  shapes.line(pts, 3 * devicePixelRatio, [0.4, 0.8, 1, 0.9]);
  // a few big circles
  shapes.circle(w * 0.2, h * 0.3, 60 * devicePixelRatio, [1, 0.4, 0.3, 0.7]);
  shapes.circle(w * 0.8, h * 0.7, 90 * devicePixelRatio, [0.4, 1, 0.6, 0.5]);

  // Particles via SpriteBatch
  sprites.begin();
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.x < 0 || p.x > w) p.vx = -p.vx;
    if (p.y < 0 || p.y > h) p.vy = -p.vy;
    const size = p.r * devicePixelRatio * 2;
    sprites.draw({
      x: p.x,
      y: p.y,
      width: size,
      height: size,
      originX: 0.5,
      originY: 0.5,
      tint: [p.hue[0], p.hue[1], p.hue[2], 0.7],
    });
  }

  renderer.frame([shapes.flush(camera.projection), sprites.flush(camera.projection)], {
    clearColor: [0.04, 0.04, 0.06, 1],
  });
  overlay.tick();
});
