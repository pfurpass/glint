export type Vec2 = [number, number];

export interface Body {
  readonly id: number;
  position: Vec2;
  velocity: Vec2;
  /** Mass; 0 = static (infinite mass, no movement). */
  mass: number;
  /** Bounciness 0..1. */
  restitution: number;
  /** Linear drag per second (0..1). */
  friction: number;
  collider: CircleCollider | AABBCollider;
  /** User-supplied tag to identify the body in collision callbacks. */
  userData?: unknown;
}

export interface CircleCollider {
  kind: "circle";
  radius: number;
}

export interface AABBCollider {
  kind: "aabb";
  halfWidth: number;
  halfHeight: number;
}

export interface CollisionEvent {
  a: Body;
  b: Body;
  normal: Vec2;
  depth: number;
}

let bodyIdSeq = 0;

export class PhysicsWorld {
  readonly gravity: Vec2 = [0, 600];
  readonly bodies: Body[] = [];
  onCollision?: (ev: CollisionEvent) => void;

  add(body: Omit<Body, "id">): Body {
    const b: Body = { ...body, id: ++bodyIdSeq };
    this.bodies.push(b);
    return b;
  }

  remove(body: Body): void {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  step(dt: number): void {
    // Integrate
    for (const b of this.bodies) {
      if (b.mass <= 0) continue;
      b.velocity[0] += this.gravity[0] * dt;
      b.velocity[1] += this.gravity[1] * dt;
      // linear drag
      const d = Math.max(0, 1 - b.friction * dt);
      b.velocity[0] *= d;
      b.velocity[1] *= d;
      b.position[0] += b.velocity[0] * dt;
      b.position[1] += b.velocity[1] * dt;
    }

    // Broadphase (O(n^2), fine for up to a few hundred bodies)
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i]!;
        const b = this.bodies[j]!;
        const hit = collide(a, b);
        if (!hit) continue;
        resolve(a, b, hit);
        this.onCollision?.({ a, b, normal: hit.normal, depth: hit.depth });
      }
    }
  }
}

interface Hit {
  normal: Vec2;
  depth: number;
}

function collide(a: Body, b: Body): Hit | null {
  if (a.collider.kind === "circle" && b.collider.kind === "circle") {
    return circleCircle(a, b, a.collider, b.collider);
  }
  if (a.collider.kind === "aabb" && b.collider.kind === "aabb") {
    return aabbAabb(a, b, a.collider, b.collider);
  }
  // circle/aabb in either order
  if (a.collider.kind === "circle" && b.collider.kind === "aabb") {
    const hit = circleAabb(a, b, a.collider, b.collider);
    return hit;
  }
  if (a.collider.kind === "aabb" && b.collider.kind === "circle") {
    const hit = circleAabb(b, a, b.collider, a.collider);
    if (!hit) return null;
    return { normal: [-hit.normal[0], -hit.normal[1]], depth: hit.depth };
  }
  return null;
}

function circleCircle(a: Body, b: Body, ca: CircleCollider, cb: CircleCollider): Hit | null {
  const dx = b.position[0] - a.position[0];
  const dy = b.position[1] - a.position[1];
  const dist = Math.hypot(dx, dy);
  const r = ca.radius + cb.radius;
  if (dist >= r) return null;
  if (dist === 0) return { normal: [1, 0], depth: r };
  return { normal: [dx / dist, dy / dist], depth: r - dist };
}

function aabbAabb(a: Body, b: Body, ba: AABBCollider, bb: AABBCollider): Hit | null {
  const dx = b.position[0] - a.position[0];
  const dy = b.position[1] - a.position[1];
  const px = ba.halfWidth + bb.halfWidth - Math.abs(dx);
  if (px <= 0) return null;
  const py = ba.halfHeight + bb.halfHeight - Math.abs(dy);
  if (py <= 0) return null;
  if (px < py) {
    return { normal: [dx < 0 ? -1 : 1, 0], depth: px };
  }
  return { normal: [0, dy < 0 ? -1 : 1], depth: py };
}

function circleAabb(c: Body, r: Body, cc: CircleCollider, rc: AABBCollider): Hit | null {
  const dx = c.position[0] - r.position[0];
  const dy = c.position[1] - r.position[1];
  const cx = Math.max(-rc.halfWidth, Math.min(rc.halfWidth, dx));
  const cy = Math.max(-rc.halfHeight, Math.min(rc.halfHeight, dy));
  const ox = dx - cx;
  const oy = dy - cy;
  const distSq = ox * ox + oy * oy;
  if (distSq >= cc.radius * cc.radius) return null;
  const dist = Math.sqrt(distSq) || 0.0001;
  return { normal: [-ox / dist, -oy / dist], depth: cc.radius - dist };
}

function resolve(a: Body, b: Body, hit: Hit): void {
  const invA = a.mass > 0 ? 1 / a.mass : 0;
  const invB = b.mass > 0 ? 1 / b.mass : 0;
  const invSum = invA + invB;
  if (invSum === 0) return;
  // Positional correction
  const corr = hit.depth / invSum;
  a.position[0] -= hit.normal[0] * corr * invA;
  a.position[1] -= hit.normal[1] * corr * invA;
  b.position[0] += hit.normal[0] * corr * invB;
  b.position[1] += hit.normal[1] * corr * invB;
  // Velocity along normal
  const rvx = b.velocity[0] - a.velocity[0];
  const rvy = b.velocity[1] - a.velocity[1];
  const velAlongN = rvx * hit.normal[0] + rvy * hit.normal[1];
  if (velAlongN > 0) return;
  const e = Math.min(a.restitution, b.restitution);
  const jMag = (-(1 + e) * velAlongN) / invSum;
  const ix = hit.normal[0] * jMag;
  const iy = hit.normal[1] * jMag;
  a.velocity[0] -= ix * invA;
  a.velocity[1] -= iy * invA;
  b.velocity[0] += ix * invB;
  b.velocity[1] += iy * invB;
}
