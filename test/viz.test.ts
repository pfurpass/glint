import { test } from "node:test";
import assert from "node:assert/strict";
import { linearScale, niceTicks } from "../src/viz/scale.js";

test("linearScale maps domain to range", () => {
  const s = linearScale([0, 10], [0, 100]);
  assert.equal(s(0), 0);
  assert.equal(s(10), 100);
  assert.equal(s(5), 50);
});

test("linearScale can be reconfigured", () => {
  const s = linearScale([0, 1], [0, 1]);
  s.domain([0, 2]).range([0, 200]);
  assert.equal(s(1), 100);
  assert.equal(s(2), 200);
});

test("niceTicks produces round numbers within range", () => {
  const t = niceTicks(0, 100, 5);
  assert.ok(t.length >= 5);
  assert.ok(t[0]! >= 0);
  assert.ok(t[t.length - 1]! <= 100);
  // step should be round — all adjacent differences equal
  const step = t[1]! - t[0]!;
  for (let i = 2; i < t.length; i++) {
    assert.ok(Math.abs(t[i]! - t[i - 1]! - step) < 1e-6);
  }
});

test("niceTicks handles degenerate range", () => {
  const t = niceTicks(5, 5, 4);
  assert.deepEqual(t, [5]);
});
