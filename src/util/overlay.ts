import type { IBackend } from "../backend/types.js";

export interface OverlayOptions {
  parent?: HTMLElement;
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Add interactive controls (isolate-draw slider, log toggle). */
  controls?: boolean;
}

export interface Overlay {
  readonly el: HTMLElement;
  tick(): void;
  destroy(): void;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function createDebugOverlay(
  backend: IBackend,
  opts: OverlayOptions = {},
): Overlay {
  const el = document.createElement("div");
  el.setAttribute("data-glint-overlay", "");
  const corner = opts.corner ?? "top-right";
  const [v, h] = corner.split("-") as [string, string];
  el.style.cssText = `
    position: fixed;
    ${v}: 8px; ${h}: 8px;
    background: rgba(0,0,0,0.72);
    color: #eee;
    font: 11px/1.4 ui-monospace, Menlo, Consolas, monospace;
    padding: 6px 8px;
    border-radius: 4px;
    z-index: 9999;
    min-width: 160px;
  `;
  (opts.parent ?? document.body).appendChild(el);

  const statsEl = document.createElement("pre");
  statsEl.style.cssText = "margin: 0; white-space: pre; pointer-events: none;";
  el.appendChild(statsEl);

  let isolateInput: HTMLInputElement | null = null;
  let isolateLabel: HTMLLabelElement | null = null;
  let logToggle: HTMLInputElement | null = null;
  let maxSeenDraws = 0;

  if (opts.controls !== false) {
    const controls = document.createElement("div");
    controls.style.cssText = "margin-top:6px; border-top:1px solid #333; padding-top:6px; font-size:10px;";

    isolateLabel = document.createElement("label");
    isolateLabel.style.cssText = "display:flex; align-items:center; gap:6px; cursor:pointer;";
    isolateLabel.innerHTML = `<span style="width:70px">isolate #</span>`;
    isolateInput = document.createElement("input");
    isolateInput.type = "number";
    isolateInput.min = "-1";
    isolateInput.value = "-1";
    isolateInput.style.cssText = "width:60px; background:#111; color:#eee; border:1px solid #333; padding:1px 3px; font-family:inherit;";
    isolateInput.addEventListener("input", () => {
      const v = parseInt(isolateInput!.value, 10);
      backend.debug.isolateDraw = Number.isFinite(v) && v >= 0 ? v : null;
    });
    isolateLabel.appendChild(isolateInput);
    controls.appendChild(isolateLabel);

    const logLabel = document.createElement("label");
    logLabel.style.cssText = "display:flex; align-items:center; gap:6px; cursor:pointer; margin-top:4px;";
    logToggle = document.createElement("input");
    logToggle.type = "checkbox";
    logToggle.addEventListener("change", () => {
      backend.debug.logCalls = !!logToggle!.checked;
    });
    logLabel.appendChild(logToggle);
    const logSpan = document.createElement("span");
    logSpan.textContent = "log backend calls";
    logLabel.appendChild(logSpan);
    controls.appendChild(logLabel);

    el.appendChild(controls);
  }

  let last = performance.now();
  let frames = 0;
  let fps = 0;
  let accum = 0;

  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    accum += dt;
    frames++;
    if (accum >= 500) {
      fps = (frames * 1000) / accum;
      frames = 0;
      accum = 0;
    }
    const s = backend.stats;
    if (s.drawCalls > maxSeenDraws) maxSeenDraws = s.drawCalls;
    if (isolateInput && !isolateInput.matches(":focus")) {
      isolateInput.max = String(Math.max(0, maxSeenDraws - 1));
    }
    statsEl.textContent =
      `${backend.kind}\n` +
      `fps      ${fps.toFixed(1)}\n` +
      `draws    ${s.drawCalls}\n` +
      `tris     ${s.triangles}\n` +
      `pipes    ${s.pipelines}\n` +
      `buffers  ${s.buffers}\n` +
      `textures ${s.textures}\n` +
      `gpu mem  ${fmtBytes(s.bytes)}`;
  };

  return {
    el,
    tick,
    destroy() {
      el.remove();
      backend.debug.isolateDraw = null;
      backend.debug.logCalls = false;
    },
  };
}
