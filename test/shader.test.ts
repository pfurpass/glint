import { test } from "node:test";
import assert from "node:assert/strict";
import { compileShader } from "../src/shader/compile.js";

const BASIC = `
struct VSIn { @location(0) pos: vec2f, @location(1) color: vec3f };
struct VSOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };
@group(0) @binding(0) var<uniform> projection: mat4x4f;
@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = projection * vec4f(in.pos, 0.0, 1.0);
  out.color = in.color;
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
`;

test("compileShader emits both WGSL and GLSL", () => {
  const r = compileShader(BASIC);
  assert.ok(r.wgsl.vertex.includes("@vertex"));
  assert.ok(r.glsl.vertex.includes("#version 300 es"));
  assert.ok(r.glsl.fragment.includes("fragColor"));
});

test("compileShader reports a top-level uniform", () => {
  const r = compileShader(BASIC);
  assert.equal(r.uniforms.length, 1);
  assert.equal(r.uniforms[0]!.name, "projection");
});

test("compileShader extracts vertex inputs with locations", () => {
  const r = compileShader(BASIC);
  assert.equal(r.vertexInputs.length, 2);
  assert.equal(r.vertexInputs[0]!.name, "pos");
  assert.equal(r.vertexInputs[0]!.location, 0);
});

const WITH_IF_FOR = `
struct VSIn { @location(0) pos: vec2f };
struct VSOut { @builtin(position) pos: vec4f };
@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  var acc: f32 = 0.0;
  for (var i: i32 = 0; i < 4; i += 1) {
    acc = acc + 1.0;
  }
  if (acc > 2.0) {
    out.pos = vec4f(in.pos, 0.0, 1.0);
  } else {
    out.pos = vec4f(0.0, 0.0, 0.0, 1.0);
  }
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f { return vec4f(1.0, 1.0, 1.0, 1.0); }
`;

test("compileShader handles if/else + for", () => {
  const r = compileShader(WITH_IF_FOR);
  assert.ok(r.wgsl.vertex.includes("if ("));
  assert.ok(r.wgsl.vertex.includes("for ("));
  assert.ok(r.glsl.vertex.includes("if ("));
  assert.ok(r.glsl.vertex.includes("for ("));
});

const WITH_STRUCT_UNIFORM = `
struct Scene { mvp: mat4x4f, color: vec4f };
struct VSIn { @location(0) pos: vec2f };
struct VSOut { @builtin(position) pos: vec4f };
@group(0) @binding(0) var<uniform> u: Scene;
@vertex fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  out.pos = u.mvp * vec4f(in.pos, 0.0, 1.0);
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f { return u.color; }
`;

test("compileShader flattens struct uniforms", () => {
  const r = compileShader(WITH_STRUCT_UNIFORM);
  assert.ok(r.uniforms.some((u) => u.name === "u_mvp"));
  assert.ok(r.uniforms.some((u) => u.name === "u_color"));
  // The flattened names should appear in the emitted GLSL
  assert.ok(r.glsl.fragment.includes("u_color"));
});

test("compileShader rejects shader without @vertex stage", () => {
  const bad = `
    struct V { @builtin(position) pos: vec4f };
    @fragment fn fs(in: V) -> @location(0) vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }
  `;
  assert.throws(() => compileShader(bad));
});
