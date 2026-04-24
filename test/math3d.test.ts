import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mat4Identity,
  mat4Multiply,
  mat4Perspective,
  mat4LookAt,
  mat4Translate,
  mat4Invert,
  quatSlerp,
  mat4FromQuat,
} from "../src/core/math3d.js";

test("mat4Identity produces the identity matrix", () => {
  const m = mat4Identity();
  for (let i = 0; i < 16; i++) {
    const expected = i === 0 || i === 5 || i === 10 || i === 15 ? 1 : 0;
    assert.equal(m[i], expected);
  }
});

test("mat4Multiply: identity * A = A", () => {
  const a = mat4Identity();
  a[12] = 3; a[13] = 4; a[14] = 5;
  const I = mat4Identity();
  const r = mat4Multiply(I, a);
  for (let i = 0; i < 16; i++) assert.equal(r[i], a[i]);
});

test("mat4Perspective writes finite values", () => {
  const m = mat4Perspective(Math.PI / 3, 16 / 9, 0.1, 1000);
  for (let i = 0; i < 16; i++) assert.ok(Number.isFinite(m[i]));
  // m[0] = f/aspect, should be positive
  assert.ok(m[0]! > 0);
  // m[11] = -1 (perspective divide)
  assert.equal(m[11], -1);
});

test("mat4LookAt: eye looking at origin down -Z produces identity-ish view", () => {
  const v = mat4LookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  // Column 0 should be world-X
  assert.ok(Math.abs(v[0]! - 1) < 1e-5);
  // Translation should place camera at +5 Z before rotation
  assert.ok(Math.abs(v[14]! + 5) < 1e-5);
});

test("mat4Translate adds to translation column", () => {
  const m = mat4Identity();
  mat4Translate(m, 2, 3, 4);
  assert.equal(m[12], 2);
  assert.equal(m[13], 3);
  assert.equal(m[14], 4);
});

test("mat4Invert: A * invert(A) ≈ identity", () => {
  const a = mat4Identity();
  mat4Translate(a, 1, 2, 3);
  a[0] = 2;
  const ai = mat4Invert(a);
  const r = mat4Multiply(a, ai);
  for (let i = 0; i < 16; i++) {
    const expected = i === 0 || i === 5 || i === 10 || i === 15 ? 1 : 0;
    assert.ok(Math.abs(r[i]! - expected) < 1e-5, `row ${i}`);
  }
});

test("quatSlerp at t=0 returns a, at t=1 returns b", () => {
  const a: [number, number, number, number] = [0, 0, 0, 1];
  const b: [number, number, number, number] = [0, 1, 0, 0];
  const o: [number, number, number, number] = [0, 0, 0, 0];
  quatSlerp(a, b, 0, o);
  assert.ok(Math.abs(o[3]! - 1) < 1e-5);
  quatSlerp(a, b, 1, o);
  assert.ok(Math.abs(o[1]! - 1) < 1e-5);
});

test("mat4FromQuat(identity) equals identity", () => {
  const m = mat4FromQuat([0, 0, 0, 1]);
  assert.equal(m[0], 1);
  assert.equal(m[5], 1);
  assert.equal(m[10], 1);
  assert.equal(m[15], 1);
});
