import { pickBackend, Renderer, Chart, createDebugOverlay } from "glint/viz";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const backend = await pickBackend(canvas);
const renderer = new Renderer(backend);

const scatterChart = new Chart(backend);
const lineChart = new Chart(backend);
const barsChart = new Chart(backend);

// 50k scatter points
const N = 50000;
const scatter = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const t = i / N;
  const noise = (Math.random() - 0.5) * 0.4;
  scatter[i * 2] = t * 10;
  scatter[i * 2 + 1] = Math.sin(t * 8) * 2 + noise + t * 0.5;
}

// line chart: moving average
const M = 800;
const lineData = new Float32Array(M * 2);
for (let i = 0; i < M; i++) {
  const t = i / M;
  lineData[i * 2] = t * 10;
  lineData[i * 2 + 1] = Math.sin(t * 8) * 2 + t * 0.5;
}

// bars
const B = 40;
const barData = new Float32Array(B * 2);
for (let i = 0; i < B; i++) {
  barData[i * 2] = i + 0.5;
  barData[i * 2 + 1] = Math.abs(Math.sin(i * 0.4)) * 100 + 10;
}

renderer.autoResize((w, h) => {
  scatterChart.camera.resize(w, h);
  lineChart.camera.resize(w, h);
  barsChart.camera.resize(w, h);

  const pad = 40 * devicePixelRatio;
  const cellW = (w - pad * 3) / 2;
  const cellH = (h - pad * 3) / 2;
  scatterChart.setRect({ x: pad, y: pad, width: cellW, height: cellH });
  lineChart.setRect({ x: pad * 2 + cellW, y: pad, width: cellW, height: cellH });
  barsChart.setRect({ x: pad, y: pad * 2 + cellH, width: w - pad * 2, height: cellH });

  scatterChart.setDomain([0, 10], [-3, 5]);
  lineChart.setDomain([0, 10], [-3, 5]);
  barsChart.setDomain([0, B], [0, 120]);
});

const overlay = createDebugOverlay(backend);

renderer.loop(() => {
  scatterChart.begin();
  scatterChart.axes({ xTicks: 10, yTicks: 6 });
  scatterChart.scatter(scatter, { radius: 1.2 * devicePixelRatio, color: [0.4, 0.8, 1, 0.35] });

  lineChart.begin();
  lineChart.axes({ xTicks: 10, yTicks: 6 });
  lineChart.line(lineData, { thickness: 2 * devicePixelRatio, color: [1, 0.7, 0.3, 1] });

  barsChart.begin();
  barsChart.axes({ xTicks: 10, yTicks: 6 });
  barsChart.bars(barData, { width: 10 * devicePixelRatio, color: [0.5, 0.9, 0.6, 0.9] });

  renderer.frame([scatterChart.flush(), lineChart.flush(), barsChart.flush()], {
    clearColor: [0.03, 0.03, 0.05, 1],
  });
  overlay.tick();
});
