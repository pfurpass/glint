import {
  mat3NormalFromMat4,
  mat4FromQuat,
  mat4Identity,
  mat4Multiply,
  mat4RotateX,
  mat4RotateY,
  mat4RotateZ,
  mat4Scale,
  mat4Translate,
  type Mat4,
  type Quat,
} from "../core/math3d.js";
import type { Mesh } from "../core/mesh.js";
import type { StandardMaterial } from "./material.js";

export class Node {
  position: [number, number, number] = [0, 0, 0];
  rotation: [number, number, number] = [0, 0, 0];
  /** If set, takes precedence over euler rotation. */
  quaternion: Quat | null = null;
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
    if (this.quaternion) {
      // TRS: T * R(quat) * S
      mat4FromQuat(this.quaternion, this.localMatrix);
      // apply scale columns
      this.localMatrix[0]! *= this.scale[0];
      this.localMatrix[1]! *= this.scale[0];
      this.localMatrix[2]! *= this.scale[0];
      this.localMatrix[4]! *= this.scale[1];
      this.localMatrix[5]! *= this.scale[1];
      this.localMatrix[6]! *= this.scale[1];
      this.localMatrix[8]! *= this.scale[2];
      this.localMatrix[9]! *= this.scale[2];
      this.localMatrix[10]! *= this.scale[2];
      // translation
      this.localMatrix[12] = this.position[0];
      this.localMatrix[13] = this.position[1];
      this.localMatrix[14] = this.position[2];
    } else {
      mat4Identity(this.localMatrix);
      mat4Translate(this.localMatrix, this.position[0], this.position[1], this.position[2]);
      if (this.rotation[0]) mat4RotateX(this.localMatrix, this.rotation[0]);
      if (this.rotation[1]) mat4RotateY(this.localMatrix, this.rotation[1]);
      if (this.rotation[2]) mat4RotateZ(this.localMatrix, this.rotation[2]);
      if (this.scale[0] !== 1 || this.scale[1] !== 1 || this.scale[2] !== 1) {
        mat4Scale(this.localMatrix, this.scale[0], this.scale[1], this.scale[2]);
      }
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
