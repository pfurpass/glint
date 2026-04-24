import { vec3Normalize, type Vec3 } from "../core/math3d.js";

export class DirectionalLight {
  direction: Float32Array;
  color: Float32Array;
  ambient: Float32Array;

  constructor(opts: {
    direction?: Vec3;
    color?: Vec3;
    ambient?: Vec3;
  } = {}) {
    const d = vec3Normalize(opts.direction ?? [0.3, 1.0, 0.5]);
    this.direction = new Float32Array(d);
    this.color = new Float32Array(opts.color ?? [1, 1, 1]);
    this.ambient = new Float32Array(opts.ambient ?? [0.15, 0.15, 0.2]);
  }
}
