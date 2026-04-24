import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: "examples",
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./examples/index.html", import.meta.url)),
        scene2d: fileURLToPath(new URL("./examples/scene2d.html", import.meta.url)),
        scene3d: fileURLToPath(new URL("./examples/scene3d.html", import.meta.url)),
        dataviz: fileURLToPath(new URL("./examples/dataviz.html", import.meta.url)),
        instanced: fileURLToPath(new URL("./examples/instanced.html", import.meta.url)),
        post: fileURLToPath(new URL("./examples/post.html", import.meta.url)),
        physics: fileURLToPath(new URL("./examples/physics.html", import.meta.url)),
        editor: fileURLToPath(new URL("./examples/editor.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: [
      { find: /^glint\/core$/, replacement: src("./src/core/index.ts") },
      { find: /^glint\/2d$/, replacement: src("./src/2d/index.ts") },
      { find: /^glint\/3d$/, replacement: src("./src/3d/index.ts") },
      { find: /^glint\/viz$/, replacement: src("./src/viz/index.ts") },
      { find: /^glint\/anim$/, replacement: src("./src/anim/index.ts") },
      { find: /^glint\/post$/, replacement: src("./src/post/index.ts") },
      { find: /^glint\/xr$/, replacement: src("./src/xr/index.ts") },
      { find: /^glint\/gltf$/, replacement: src("./src/3d/gltf.ts") },
      { find: /^glint\/physics$/, replacement: src("./src/physics/index.ts") },
      { find: /^glint\/audio$/, replacement: src("./src/audio/index.ts") },
      { find: /^glint\/editor$/, replacement: src("./src/editor/index.ts") },
      { find: /^glint\/shader$/, replacement: src("./src/shader/index.ts") },
      { find: /^glint\/backend$/, replacement: src("./src/backend/index.ts") },
      { find: /^glint$/, replacement: src("./src/index.ts") },
    ],
  },
});
