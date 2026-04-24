import type { IBackend } from "../backend/types.js";
import { PostEffect } from "./pass.js";

/** Maps color to luminance. No uniforms. */
export function grayscale(backend: IBackend): PostEffect {
  return new PostEffect(
    backend,
    `
    let lum = dot(src.rgb, vec3f(0.299, 0.587, 0.114));
    return vec4f(vec3f(lum, lum, lum), src.a);
  `,
  );
}

/** Darkens the edges. uniforms: strength (0..1). */
export function vignette(backend: IBackend, strength = 0.6): PostEffect {
  const s = new Float32Array([strength]);
  return new PostEffect(
    backend,
    `
    let centered = uv - vec2f(0.5, 0.5);
    let r = length(centered);
    let v = 1.0 - strength * smoothstep(0.3, 0.8, r);
    return vec4f(src.rgb * v, src.a);
  `,
    { strength: s },
  );
}

/** Simple scanline effect. uniforms: density (lines per screen), amount (0..1). */
export function scanlines(backend: IBackend, density = 400, amount = 0.15): PostEffect {
  return new PostEffect(
    backend,
    `
    let line = sin(uv.y * density) * 0.5 + 0.5;
    return vec4f(src.rgb * (1.0 - amount + amount * line), src.a);
  `,
    {
      density: new Float32Array([density]),
      amount: new Float32Array([amount]),
    },
  );
}

/** 9-tap box blur. uniforms: radius in pixels, texelSize (1/width, 1/height). */
export function blur(backend: IBackend, radius = 2, texelSize: [number, number] = [1 / 1024, 1 / 1024]): PostEffect {
  return new PostEffect(
    backend,
    `
    let step = texelSize * radius;
    var sum = vec4f(0.0, 0.0, 0.0, 0.0);
    sum = sum + textureSample(tex, samp, uv + vec2f(-step.x, -step.y));
    sum = sum + textureSample(tex, samp, uv + vec2f(0.0, -step.y));
    sum = sum + textureSample(tex, samp, uv + vec2f(step.x, -step.y));
    sum = sum + textureSample(tex, samp, uv + vec2f(-step.x, 0.0));
    sum = sum + src;
    sum = sum + textureSample(tex, samp, uv + vec2f(step.x, 0.0));
    sum = sum + textureSample(tex, samp, uv + vec2f(-step.x, step.y));
    sum = sum + textureSample(tex, samp, uv + vec2f(0.0, step.y));
    sum = sum + textureSample(tex, samp, uv + vec2f(step.x, step.y));
    return sum / 9.0;
  `,
    {
      radius: new Float32Array([radius]),
      texelSize: new Float32Array(texelSize),
    },
  );
}

/** Threshold-based bloom-lite: keeps bright pixels, blurred additive. uniforms: threshold, intensity. */
export function bloom(backend: IBackend, threshold = 0.7, intensity = 1.2): PostEffect {
  return new PostEffect(
    backend,
    `
    let brightness = max(max(src.r, src.g), src.b);
    let weight = smoothstep(threshold, 1.0, brightness);
    let add = src.rgb * weight * intensity;
    return vec4f(src.rgb + add, src.a);
  `,
    {
      threshold: new Float32Array([threshold]),
      intensity: new Float32Array([intensity]),
    },
  );
}

/** Chromatic aberration: shifts R/B channels. uniforms: strength. */
export function chromaticAberration(backend: IBackend, strength = 0.004): PostEffect {
  return new PostEffect(
    backend,
    `
    let dir = uv - vec2f(0.5, 0.5);
    let r = textureSample(tex, samp, uv + dir * strength).r;
    let g = src.g;
    let b = textureSample(tex, samp, uv - dir * strength).b;
    return vec4f(r, g, b, src.a);
  `,
    { strength: new Float32Array([strength]) },
  );
}

/** Film grain noise. uniforms: amount, time (pass time to re-seed). */
export function filmGrain(backend: IBackend, amount = 0.08): PostEffect {
  return new PostEffect(
    backend,
    `
    let n = fract(sin(dot(uv * time, vec2f(12.9898, 78.233))) * 43758.547);
    return vec4f(src.rgb + (n - 0.5) * amount, src.a);
  `,
    {
      amount: new Float32Array([amount]),
      time: new Float32Array([1]),
    },
  );
}

/** Quantize UVs to a grid. uniforms: pixelSize (UV units, e.g. 0.01). */
export function pixelate(backend: IBackend, pixelSize = 0.01): PostEffect {
  return new PostEffect(
    backend,
    `
    let snapped = floor(uv / pixelSize) * pixelSize + pixelSize * 0.5;
    return textureSample(tex, samp, snapped);
  `,
    { pixelSize: new Float32Array([pixelSize]) },
  );
}

/** Color inversion. */
export function invert(backend: IBackend): PostEffect {
  return new PostEffect(
    backend,
    `return vec4f(1.0 - src.r, 1.0 - src.g, 1.0 - src.b, src.a);`,
  );
}

/** Reinhard tone-mapping + gamma 2.2. uniforms: exposure. */
export function toneMap(backend: IBackend, exposure = 1.0): PostEffect {
  return new PostEffect(
    backend,
    `
    let c = src.rgb * exposure;
    let mapped = c / (c + vec3f(1.0, 1.0, 1.0));
    let gamma = pow(mapped, vec3f(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
    return vec4f(gamma, src.a);
  `,
    { exposure: new Float32Array([exposure]) },
  );
}

/** Sobel edge detection. uniforms: texelSize (1/w, 1/h), strength. */
export function edgeDetect(backend: IBackend, texelSize: [number, number] = [1 / 1024, 1 / 1024], strength = 1.0): PostEffect {
  return new PostEffect(
    backend,
    `
    let tx = texelSize.x;
    let ty = texelSize.y;
    let l = textureSample(tex, samp, uv + vec2f(-tx, 0.0)).rgb;
    let r = textureSample(tex, samp, uv + vec2f(tx, 0.0)).rgb;
    let u = textureSample(tex, samp, uv + vec2f(0.0, -ty)).rgb;
    let d = textureSample(tex, samp, uv + vec2f(0.0, ty)).rgb;
    let gx = r - l;
    let gy = d - u;
    let e = length(gx) + length(gy);
    return vec4f(vec3f(e, e, e) * strength, src.a);
  `,
    {
      texelSize: new Float32Array(texelSize),
      strength: new Float32Array([strength]),
    },
  );
}

/** Multiplicative color grade. uniforms: tint (rgb), contrast, brightness. */
export function colorGrade(
  backend: IBackend,
  tint: [number, number, number] = [1, 1, 1],
  contrast = 1.1,
  brightness = 0.0,
): PostEffect {
  return new PostEffect(
    backend,
    `
    let c = (src.rgb - vec3f(0.5, 0.5, 0.5)) * contrast + vec3f(0.5, 0.5, 0.5) + vec3f(brightness, brightness, brightness);
    return vec4f(c * tint, src.a);
  `,
    {
      tint: new Float32Array(tint),
      contrast: new Float32Array([contrast]),
      brightness: new Float32Array([brightness]),
    },
  );
}
