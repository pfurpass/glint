// Measure gzipped bundle size for each entry-point.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRIES = {
  "glint/core": "src/core/index.ts",
  "glint/2d": "src/2d/index.ts",
  "glint/3d": "src/3d/index.ts",
  "glint/viz": "src/viz/index.ts",
  "glint/anim": "src/anim/index.ts",
  "glint/post": "src/post/index.ts",
  "glint/xr": "src/xr/index.ts",
  "glint/physics": "src/physics/index.ts",
  "glint/audio": "src/audio/index.ts",
  "glint/editor": "src/editor/index.ts",
  "glint/shader": "src/shader/index.ts",
  "glint/backend": "src/backend/index.ts",
  "glint (all)": "src/index.ts",
};

const dir = mkdtempSync(join(tmpdir(), "glint-size-"));
const rows = [];

for (const [name, entry] of Object.entries(ENTRIES)) {
  const out = join(dir, name.replace(/[\/ ()]/g, "_") + ".js");
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    treeShaking: true,
    outfile: out,
    logLevel: "silent",
  });
  const raw = readFileSync(out);
  const gz = gzipSync(raw);
  rows.push({ name, raw: raw.byteLength, gz: gz.byteLength });
}

rmSync(dir, { recursive: true });

const fmt = (b) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;

const nameW = Math.max(...rows.map((r) => r.name.length));
console.log("");
console.log("bundle sizes (esbuild --minify, single-file tree-shaken):");
console.log("");
console.log(`  ${"entry".padEnd(nameW)}   min       gzip`);
console.log(`  ${"-".repeat(nameW)}   --------  --------`);
for (const r of rows) {
  console.log(`  ${r.name.padEnd(nameW)}   ${fmt(r.raw).padEnd(8)}  ${fmt(r.gz)}`);
}
console.log("");
