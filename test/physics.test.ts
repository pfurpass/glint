import { test } from "node:test";
import assert from "node:assert/strict";
import { PhysicsWorld } from "../src/physics/world.js";

test("gravity pulls a body downward", () => {
  const w = new PhysicsWorld();
  const b = w.add({
    position: [0, 0],
    velocity: [0, 0],
    mass: 1,
    restitution: 0,
    friction: 0,
    collider: { kind: "circle", radius: 1 },
  });
  w.step(1);
  // gravity default 600; velocity should be 600 after 1s, position ~600
  assert.ok(b.velocity[1] > 500);
  assert.ok(b.position[1] > 500);
});

test("static body (mass=0) does not move", () => {
  const w = new PhysicsWorld();
  w.gravity[1] = 900;
  const ground = w.add({
    position: [100, 100],
    velocity: [0, 0],
    mass: 0,
    restitution: 0.5,
    friction: 0,
    collider: { kind: "aabb", halfWidth: 50, halfHeight: 10 },
  });
  w.step(1);
  assert.equal(ground.position[0], 100);
  assert.equal(ground.position[1], 100);
});

test("circle-circle collision separates bodies", () => {
  const w = new PhysicsWorld();
  w.gravity[1] = 0;
  const a = w.add({
    position: [0, 0],
    velocity: [10, 0],
    mass: 1,
    restitution: 0,
    friction: 0,
    collider: { kind: "circle", radius: 1 },
  });
  const b = w.add({
    position: [1.5, 0],
    velocity: [-10, 0],
    mass: 1,
    restitution: 0,
    friction: 0,
    collider: { kind: "circle", radius: 1 },
  });
  w.step(0.1);
  const dist = Math.hypot(b.position[0] - a.position[0], b.position[1] - a.position[1]);
  assert.ok(dist >= 2 - 1e-4, `bodies separated: dist=${dist}`);
});

test("collision callback fires with expected structure", () => {
  const w = new PhysicsWorld();
  w.gravity[1] = 0;
  let captured: number | null = null;
  w.onCollision = (ev) => {
    captured = ev.depth;
    assert.ok(Array.isArray(ev.normal));
    assert.equal(ev.normal.length, 2);
  };
  w.add({
    position: [0, 0],
    velocity: [0, 0],
    mass: 1,
    restitution: 0,
    friction: 0,
    collider: { kind: "circle", radius: 1 },
  });
  w.add({
    position: [1, 0],
    velocity: [0, 0],
    mass: 1,
    restitution: 0,
    friction: 0,
    collider: { kind: "circle", radius: 1 },
  });
  w.step(0);
  assert.ok(captured !== null);
});
