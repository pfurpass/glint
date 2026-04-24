import type { Node } from "../3d/node.js";
import type { Scene3D } from "../3d/scene.js";

export interface EditorOptions {
  parent?: HTMLElement;
  title?: string;
}

export interface Editor {
  readonly el: HTMLElement;
  /** Rebuilds the tree + detail panel (call if you added/removed nodes). */
  refresh(): void;
  /** Reads current values from the selected node back into slider/colour inputs. Call each frame to reflect external changes (animation, physics, code). */
  tick(): void;
  destroy(): void;
}

/**
 * Minimal in-browser scene editor: a panel listing the Scene3D nodes, with sliders
 * for position/rotation/scale and a colour picker for the base colour.
 *
 * Intentionally tiny — not a full IDE. Good enough to inspect a scene at runtime,
 * drag objects with sliders, flip colours. For production tooling you'd build a
 * separate app; this is the "attach the editor for a debugging session" tier.
 */
export function createSceneEditor(scene: Scene3D, opts: EditorOptions = {}): Editor {
  const panel = document.createElement("div");
  panel.setAttribute("data-glint-editor", "");
  panel.style.cssText = `
    position: fixed;
    top: 8px; left: 8px;
    width: 280px;
    max-height: calc(100vh - 16px);
    overflow: auto;
    background: rgba(12,13,17,0.92);
    color: #e6e6e6;
    border: 1px solid #333;
    border-radius: 6px;
    font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace;
    padding: 10px;
    z-index: 9999;
    user-select: none;
  `;
  const h = document.createElement("div");
  h.textContent = opts.title ?? "scene editor";
  h.style.cssText = "font-weight: 600; margin-bottom: 8px; font-size: 11px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.08em;";
  panel.appendChild(h);

  const list = document.createElement("div");
  panel.appendChild(list);

  const details = document.createElement("div");
  details.style.cssText = "margin-top: 10px; border-top: 1px solid #2a2a2a; padding-top: 10px;";
  panel.appendChild(details);

  (opts.parent ?? document.body).appendChild(panel);

  let selected: Node | null = null;

  function row(label: string, control: HTMLElement): HTMLElement {
    const r = document.createElement("div");
    r.style.cssText = "display:grid; grid-template-columns: 70px 1fr; align-items:center; gap:6px; margin: 2px 0;";
    const l = document.createElement("label");
    l.textContent = label;
    l.style.cssText = "opacity:0.75;";
    r.appendChild(l);
    r.appendChild(control);
    return r;
  }

  // Track controls so tick() can sync them from the target.
  const syncers: Array<() => void> = [];

  function makeAxisSlider(
    label: string,
    getter: () => number[],
    index: number,
    min: number,
    max: number,
    step: number,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex; align-items:center; gap:6px;";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(getter()[index]);
    input.style.cssText = "flex:1; accent-color:#5da8ff;";
    const num = document.createElement("span");
    num.style.cssText = "width: 42px; text-align:right; font-variant-numeric: tabular-nums;";
    num.textContent = Number(input.value).toFixed(2);
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      getter()[index] = v;
      num.textContent = v.toFixed(2);
    });
    wrap.appendChild(input);
    wrap.appendChild(num);
    syncers.push(() => {
      if (document.activeElement === input) return; // don't fight user drag
      const cur = getter()[index]!;
      const str = String(cur);
      if (input.value !== str) input.value = str;
      const disp = cur.toFixed(2);
      if (num.textContent !== disp) num.textContent = disp;
    });
    return row(label, wrap);
  }

  function makeColorPicker(label: string, arr: Float32Array): HTMLElement {
    const input = document.createElement("input");
    input.type = "color";
    const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
    const computeHex = () => `#${toHex(arr[0]!)}${toHex(arr[1]!)}${toHex(arr[2]!)}`;
    input.value = computeHex();
    input.style.cssText = "width: 60px; height: 22px; background: transparent; border: 1px solid #333; cursor: pointer;";
    input.addEventListener("input", () => {
      const hex = input.value;
      arr[0] = parseInt(hex.slice(1, 3), 16) / 255;
      arr[1] = parseInt(hex.slice(3, 5), 16) / 255;
      arr[2] = parseInt(hex.slice(5, 7), 16) / 255;
    });
    syncers.push(() => {
      if (document.activeElement === input) return;
      const hex = computeHex();
      if (input.value !== hex) input.value = hex;
    });
    return row(label, input);
  }

  function renderDetails(): void {
    details.innerHTML = "";
    syncers.length = 0;
    if (!selected) {
      const empty = document.createElement("div");
      empty.style.cssText = "opacity:0.5;";
      empty.textContent = "select a node";
      details.appendChild(empty);
      return;
    }
    const title = document.createElement("div");
    title.style.cssText = "font-weight:600; margin-bottom:6px;";
    title.textContent = selected.mesh ? "mesh node" : "node";
    details.appendChild(title);

    const posGroup = document.createElement("div");
    posGroup.appendChild(row("position", document.createElement("span")));
    posGroup.appendChild(makeAxisSlider("  x", () => selected!.position, 0, -10, 10, 0.01));
    posGroup.appendChild(makeAxisSlider("  y", () => selected!.position, 1, -10, 10, 0.01));
    posGroup.appendChild(makeAxisSlider("  z", () => selected!.position, 2, -10, 10, 0.01));
    details.appendChild(posGroup);

    const rotGroup = document.createElement("div");
    rotGroup.style.marginTop = "6px";
    rotGroup.appendChild(row("rotation", document.createElement("span")));
    rotGroup.appendChild(makeAxisSlider("  x", () => selected!.rotation, 0, -Math.PI * 2, Math.PI * 2, 0.01));
    rotGroup.appendChild(makeAxisSlider("  y", () => selected!.rotation, 1, -Math.PI * 2, Math.PI * 2, 0.01));
    rotGroup.appendChild(makeAxisSlider("  z", () => selected!.rotation, 2, -Math.PI * 2, Math.PI * 2, 0.01));
    details.appendChild(rotGroup);

    const sclGroup = document.createElement("div");
    sclGroup.style.marginTop = "6px";
    sclGroup.appendChild(row("scale", document.createElement("span")));
    sclGroup.appendChild(makeAxisSlider("  x", () => selected!.scale, 0, 0.01, 5, 0.01));
    sclGroup.appendChild(makeAxisSlider("  y", () => selected!.scale, 1, 0.01, 5, 0.01));
    sclGroup.appendChild(makeAxisSlider("  z", () => selected!.scale, 2, 0.01, 5, 0.01));
    details.appendChild(sclGroup);

    if (selected.material) {
      const matGroup = document.createElement("div");
      matGroup.style.marginTop = "6px";
      matGroup.appendChild(makeColorPicker("color", selected.material.baseColor));
      details.appendChild(matGroup);
    }
  }

  function renderList(): void {
    list.innerHTML = "";
    let index = 0;
    const walk = (n: Node, depth: number) => {
      const row = document.createElement("div");
      row.style.cssText = `
        padding: 3px ${6 + depth * 12}px;
        cursor: pointer;
        border-radius: 3px;
        ${n === selected ? "background:#1f4d7d;" : ""}
      `;
      const label = n.mesh ? `▸ mesh${index}` : `• node${index}`;
      row.textContent = label;
      row.addEventListener("click", () => {
        selected = n;
        renderList();
        renderDetails();
      });
      row.addEventListener("mouseenter", () => { if (n !== selected) row.style.background = "#1a1d23"; });
      row.addEventListener("mouseleave", () => { if (n !== selected) row.style.background = ""; });
      list.appendChild(row);
      index++;
      for (const c of n.children) walk(c, depth + 1);
    };
    walk(scene.root, 0);
  }

  renderList();
  renderDetails();

  return {
    el: panel,
    refresh: () => {
      renderList();
      renderDetails();
    },
    tick: () => {
      for (const s of syncers) s();
    },
    destroy: () => panel.remove(),
  };
}
