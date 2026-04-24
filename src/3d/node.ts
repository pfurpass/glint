import {
  mat3NormalFromMat4,
  mat4Identity,
  mat4Multiply,
  mat4RotateX,
  mat4RotateY,
  mat4RotateZ,
  mat4Scale,
  mat4Translate,
  type Mat4,
} from "../core/math3d.js";
import type { Mesh } from "../core/mesh.js";
import type { StandardMaterial } from "./material.js";

export class Node {
  position: [number, number, number] = [0, 0, 0];
  rotation: [number, number, number] = [0, 0, 0];
  scale: [number, number, number] = [1, 1, 1];
  children: Node[] = [];
  parent: Node | null = null;

  readonly localMatrix: Mat4 = mat4Identity();
  readonly worldMatrix: Mat4 = mat4Identity();
  readonly normalMatrix = new Float32Array(9);

  mesh?: Mesh;
  material?: StandardMaterial;

  add(child: Node): this {
    child.parent = this;
    this.children.push(child);
    return this;
  }

  updateLocal(): void {
    mat4Identity(this.localMatrix);
    mat4Translate(this.localMatrix, this.position[0], this.position[1], this.position[2]);
    if (this.rotation[0]) mat4RotateX(this.localMatrix, this.rotation[0]);
    if (this.rotation[1]) mat4RotateY(this.localMatrix, this.rotation[1]);
    if (this.rotation[2]) mat4RotateZ(this.localMatrix, this.rotation[2]);
    if (this.scale[0] !== 1 || this.scale[1] !== 1 || this.scale[2] !== 1) {
      mat4Scale(this.localMatrix, this.scale[0], this.scale[1], this.scale[2]);
    }
  }

  updateWorld(parentWorld?: Mat4): void {
    this.updateLocal();
    if (parentWorld) {
      mat4Multiply(this.localMatrix, parentWorld, this.worldMatrix);
    } else {
      this.worldMatrix.set(this.localMatrix);
    }
    mat3NormalFromMat4(this.worldMatrix, this.normalMatrix);
    for (const c of this.children) c.updateWorld(this.worldMatrix);
  }
}
