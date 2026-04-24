import {
  mat4Identity,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  type Vec3,
} from "../core/math3d.js";

export class Camera3D {
  readonly view = mat4Identity();
  readonly projection = mat4Identity();
  readonly viewProjection = mat4Identity();

  position: Vec3 = [0, 0, 3];
  target: Vec3 = [0, 0, 0];
  up: Vec3 = [0, 1, 0];
  fovY = Math.PI / 3;
  near = 0.1;
  far = 100;
  aspect = 1;

  constructor(aspect = 1) {
    this.aspect = aspect;
    this.update();
  }

  resize(width: number, height: number): void {
    this.aspect = width / Math.max(1, height);
    this.update();
  }

  update(): void {
    mat4Perspective(this.fovY, this.aspect, this.near, this.far, this.projection);
    mat4LookAt(this.position, this.target, this.up, this.view);
    mat4Multiply(this.projection, this.view, this.viewProjection);
  }
}
