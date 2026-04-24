import type { RenderableItem } from "../core/renderer.js";
import type { Camera3D } from "./camera.js";
import type { DirectionalLight } from "./lights.js";
import type { Node } from "./node.js";

export class Scene3D {
  root: Node;
  light: DirectionalLight;

  constructor(root: Node, light: DirectionalLight) {
    this.root = root;
    this.light = light;
  }

  collect(camera: Camera3D): RenderableItem[] {
    camera.update();
    this.root.updateWorld();
    const out: RenderableItem[] = [];
    const walk = (n: Node) => {
      if (n.mesh && n.material) {
        out.push({
          mesh: n.mesh,
          material: n.material,
          uniforms: {
            viewProjection: camera.viewProjection,
            model: n.worldMatrix,
            normalMatrix: n.normalMatrix,
            lightDir: this.light.direction,
            lightColor: this.light.color,
            ambient: this.light.ambient,
            baseColor: n.material.baseColor,
          },
        });
      }
      for (const c of n.children) walk(c);
    };
    walk(this.root);
    return out;
  }
}
