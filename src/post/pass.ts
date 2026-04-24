import type { IBackend, IBuffer, IRenderTarget, ISampler, ITexture } from "../backend/types.js";
import { compileShader } from "../shader/compile.js";
import { Material } from "../core/mesh.js";
import type { Renderer } from "../core/renderer.js";

const LAYOUT = {
  stride: 16, // vec2 pos + vec2 uv
  attributes: [
    { name: "pos", location: 0, format: "float32x2" as const, offset: 0 },
    { name: "uv", location: 1, format: "float32x2" as const, offset: 8 },
  ],
};

const FULLSCREEN_VS = `
struct VSIn { @location(0) pos: vec2f, @location(1) uv: vec2f };
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}
`;

function fullscreenQuad(backend: IBackend): IBuffer {
  const data = new Float32Array([
    -1, -1, 0, 1,
    1, -1, 1, 1,
    1, 1, 1, 0,
    -1, -1, 0, 1,
    1, 1, 1, 0,
    -1, 1, 0, 0,
  ]);
  const buf = backend.createBuffer("vertex", data.byteLength);
  buf.write(data);
  return buf;
}

/** A single fullscreen-shader post-effect. */
export class PostEffect {
  readonly material: Material;
  readonly uniforms: Record<string, Float32Array>;

  constructor(
    backend: IBackend,
    fragmentBody: string,
    uniforms: Record<string, Float32Array> = {},
  ) {
    // Build a full WGSL-subset module: the vertex stage is fixed, the user supplies the fragment.
    const uniformDecls = Object.keys(uniforms)
      .map((name, i) => {
        const v = uniforms[name]!;
        const t =
          v.length === 1 ? "f32"
          : v.length === 2 ? "vec2f"
          : v.length === 3 ? "vec3f"
          : v.length === 4 ? "vec4f"
          : null;
        if (!t) throw new Error(`[glint] PostEffect: uniform '${name}' must be 1-4 floats`);
        return `@group(0) @binding(${i + 2}) var<uniform> ${name}: ${t};`;
      })
      .join("\n");
    const source = `
${FULLSCREEN_VS}
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
${uniformDecls}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let uv = in.uv;
  let src = textureSample(tex, samp, uv);
  ${fragmentBody}
}
`;
    const shader = compileShader(source);
    this.material = new Material(backend, shader, LAYOUT, { topology: "triangle-list" });
    this.uniforms = uniforms;
  }

  destroy(): void {
    this.material.destroy();
  }
}

/**
 * Post-processing chain: scene renders into ping buffer, each effect reads ping and writes pong, swap.
 * Final effect writes to the canvas.
 */
export class PostChain {
  private readonly pingTarget: IRenderTarget;
  private readonly pongTarget: IRenderTarget;
  private readonly sampler: ISampler;
  private readonly quadBuffer: IBuffer;
  private readonly effects: PostEffect[] = [];
  private width = 0;
  private height = 0;

  constructor(
    backend: IBackend,
    initialWidth: number,
    initialHeight: number,
  ) {
    this.pingTarget = backend.createRenderTarget(initialWidth, initialHeight);
    this.pongTarget = backend.createRenderTarget(initialWidth, initialHeight);
    this.width = initialWidth;
    this.height = initialHeight;
    this.sampler = backend.createSampler({ minFilter: "linear", magFilter: "linear" });
    this.quadBuffer = fullscreenQuad(backend);
  }

  add(effect: PostEffect): this {
    this.effects.push(effect);
    return this;
  }

  /** The render target you should draw your scene into. */
  get sceneTarget(): IRenderTarget {
    return this.pingTarget;
  }

  /** Run all effects, flushing to the canvas. */
  present(renderer: Renderer): void {
    if (this.effects.length === 0) {
      // Nothing to do. (User should disable PostChain in that case.)
      return;
    }
    let src: ITexture = this.pingTarget.colorTexture;
    for (let i = 0; i < this.effects.length; i++) {
      const effect = this.effects[i]!;
      const last = i === this.effects.length - 1;
      const target = last ? null : i % 2 === 0 ? this.pongTarget : this.pingTarget;
      renderer.frame(
        [
          {
            mesh: { vertexBuffer: this.quadBuffer, vertexCount: 6 },
            material: effect.material,
            uniforms: effect.uniforms,
            textures: { tex: src },
            samplers: { samp: this.sampler },
          },
        ],
        {
          clearColor: [0, 0, 0, 1],
          ...(target ? { target } : {}),
        },
      );
      if (target) src = target.colorTexture;
    }
  }

  destroy(): void {
    this.pingTarget.destroy();
    this.pongTarget.destroy();
    this.sampler.destroy();
    this.quadBuffer.destroy();
    for (const e of this.effects) e.destroy();
    void this.width;
    void this.height;
  }
}
