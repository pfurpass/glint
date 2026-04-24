export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function mat4Identity(out?: Mat4): Mat4 {
  const m = out ?? new Float32Array(16);
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Perspective(
  fovYRadians: number,
  aspect: number,
  near: number,
  far: number,
  out?: Mat4,
): Mat4 {
  const m = out ?? new Float32Array(16);
  const f = 1 / Math.tan(fovYRadians / 2);
  const nf = 1 / (near - far);
  m.fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3, out?: Mat4): Mat4 {
  const m = out ?? new Float32Array(16);
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz);
  const fz: Vec3 = len > 0 ? [zx / len, zy / len, zz / len] : [0, 0, 1];
  const xx = up[1] * fz[2] - up[2] * fz[1];
  const xy = up[2] * fz[0] - up[0] * fz[2];
  const xz = up[0] * fz[1] - up[1] * fz[0];
  len = Math.hypot(xx, xy, xz);
  const fx: Vec3 = len > 0 ? [xx / len, xy / len, xz / len] : [1, 0, 0];
  const fy: Vec3 = [
    fz[1] * fx[2] - fz[2] * fx[1],
    fz[2] * fx[0] - fz[0] * fx[2],
    fz[0] * fx[1] - fz[1] * fx[0],
  ];
  m[0] = fx[0];  m[1] = fy[0];  m[2] = fz[0];  m[3] = 0;
  m[4] = fx[1];  m[5] = fy[1];  m[6] = fz[1];  m[7] = 0;
  m[8] = fx[2];  m[9] = fy[2];  m[10] = fz[2]; m[11] = 0;
  m[12] = -(fx[0] * eye[0] + fx[1] * eye[1] + fx[2] * eye[2]);
  m[13] = -(fy[0] * eye[0] + fy[1] * eye[1] + fy[2] * eye[2]);
  m[14] = -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]);
  m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4, out?: Mat4): Mat4 {
  const m = out ?? new Float32Array(16);
  const a00=a[0]!,a01=a[1]!,a02=a[2]!,a03=a[3]!;
  const a10=a[4]!,a11=a[5]!,a12=a[6]!,a13=a[7]!;
  const a20=a[8]!,a21=a[9]!,a22=a[10]!,a23=a[11]!;
  const a30=a[12]!,a31=a[13]!,a32=a[14]!,a33=a[15]!;
  for (let i = 0; i < 4; i++) {
    const bi0=b[i*4]!,bi1=b[i*4+1]!,bi2=b[i*4+2]!,bi3=b[i*4+3]!;
    m[i*4+0] = bi0*a00 + bi1*a10 + bi2*a20 + bi3*a30;
    m[i*4+1] = bi0*a01 + bi1*a11 + bi2*a21 + bi3*a31;
    m[i*4+2] = bi0*a02 + bi1*a12 + bi2*a22 + bi3*a32;
    m[i*4+3] = bi0*a03 + bi1*a13 + bi2*a23 + bi3*a33;
  }
  return m;
}

export function mat4Translate(m: Mat4, tx: number, ty: number, tz: number): Mat4 {
  m[12] = m[0]! * tx + m[4]! * ty + m[8]!  * tz + m[12]!;
  m[13] = m[1]! * tx + m[5]! * ty + m[9]!  * tz + m[13]!;
  m[14] = m[2]! * tx + m[6]! * ty + m[10]! * tz + m[14]!;
  m[15] = m[3]! * tx + m[7]! * ty + m[11]! * tz + m[15]!;
  return m;
}

export function mat4Scale(m: Mat4, sx: number, sy: number, sz: number): Mat4 {
  m[0]! *= sx; m[1]! *= sx; m[2]! *= sx; m[3]! *= sx;
  m[4]! *= sy; m[5]! *= sy; m[6]! *= sy; m[7]! *= sy;
  m[8]! *= sz; m[9]! *= sz; m[10]! *= sz; m[11]! *= sz;
  return m;
}

export function mat4RotateY(m: Mat4, rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m00=m[0]!,m01=m[1]!,m02=m[2]!,m03=m[3]!;
  const m20=m[8]!,m21=m[9]!,m22=m[10]!,m23=m[11]!;
  m[0]  = c*m00 - s*m20;
  m[1]  = c*m01 - s*m21;
  m[2]  = c*m02 - s*m22;
  m[3]  = c*m03 - s*m23;
  m[8]  = s*m00 + c*m20;
  m[9]  = s*m01 + c*m21;
  m[10] = s*m02 + c*m22;
  m[11] = s*m03 + c*m23;
  return m;
}

export function mat4RotateX(m: Mat4, rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m10=m[4]!,m11=m[5]!,m12=m[6]!,m13=m[7]!;
  const m20=m[8]!,m21=m[9]!,m22=m[10]!,m23=m[11]!;
  m[4]  = c*m10 + s*m20;
  m[5]  = c*m11 + s*m21;
  m[6]  = c*m12 + s*m22;
  m[7]  = c*m13 + s*m23;
  m[8]  = -s*m10 + c*m20;
  m[9]  = -s*m11 + c*m21;
  m[10] = -s*m12 + c*m22;
  m[11] = -s*m13 + c*m23;
  return m;
}

export function mat4RotateZ(m: Mat4, rad: number): Mat4 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const m00=m[0]!,m01=m[1]!,m02=m[2]!,m03=m[3]!;
  const m10=m[4]!,m11=m[5]!,m12=m[6]!,m13=m[7]!;
  m[0] = c*m00 + s*m10;
  m[1] = c*m01 + s*m11;
  m[2] = c*m02 + s*m12;
  m[3] = c*m03 + s*m13;
  m[4] = -s*m00 + c*m10;
  m[5] = -s*m01 + c*m11;
  m[6] = -s*m02 + c*m12;
  m[7] = -s*m03 + c*m13;
  return m;
}

/** Compute the 3x3 normal matrix (inverse-transpose upper-left 3x3) packed as mat3. */
export function mat3NormalFromMat4(m: Mat4, out?: Float32Array): Float32Array {
  const n = out ?? new Float32Array(9);
  const a00=m[0]!,a01=m[1]!,a02=m[2]!;
  const a10=m[4]!,a11=m[5]!,a12=m[6]!;
  const a20=m[8]!,a21=m[9]!,a22=m[10]!;
  const b01 = a22*a11 - a12*a21;
  const b11 = -a22*a10 + a12*a20;
  const b21 = a21*a10 - a11*a20;
  const det = a00*b01 + a01*b11 + a02*b21;
  if (det === 0) { n.fill(0); return n; }
  const id = 1 / det;
  n[0] = b01 * id;
  n[1] = (-a22*a01 + a02*a21) * id;
  n[2] = (a12*a01 - a02*a11) * id;
  n[3] = b11 * id;
  n[4] = (a22*a00 - a02*a20) * id;
  n[5] = (-a12*a00 + a02*a10) * id;
  n[6] = b21 * id;
  n[7] = (-a21*a00 + a01*a20) * id;
  n[8] = (a11*a00 - a01*a10) * id;
  return n;
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

export type Quat = [number, number, number, number];

export function quatIdentity(): Quat {
  return [0, 0, 0, 1];
}

export function quatSlerp(a: Quat, b: Quat, t: number, out: Quat): Quat {
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let cosHalf = ax * bx + ay * by + az * bz + aw * bw;
  if (cosHalf < 0) {
    cosHalf = -cosHalf;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let s0: number, s1: number;
  if (1 - cosHalf > 1e-6) {
    const omega = Math.acos(cosHalf);
    const sinO = Math.sin(omega);
    s0 = Math.sin((1 - t) * omega) / sinO;
    s1 = Math.sin(t * omega) / sinO;
  } else {
    s0 = 1 - t;
    s1 = t;
  }
  out[0] = s0 * ax + s1 * bx;
  out[1] = s0 * ay + s1 * by;
  out[2] = s0 * az + s1 * bz;
  out[3] = s0 * aw + s1 * bw;
  return out;
}

/** Build a rotation mat4 from a quaternion and write into `m` (replacing rotation only). */
export function mat4FromQuat(q: Quat, out?: Mat4): Mat4 {
  const m = out ?? new Float32Array(16);
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0]  = 1 - (yy + zz); m[1]  = xy + wz;       m[2]  = xz - wy;       m[3]  = 0;
  m[4]  = xy - wz;       m[5]  = 1 - (xx + zz); m[6]  = yz + wx;       m[7]  = 0;
  m[8]  = xz + wy;       m[9]  = yz - wx;       m[10] = 1 - (xx + yy); m[11] = 0;
  m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
  return m;
}

export function mat4Invert(m: Mat4, out?: Mat4): Mat4 {
  const o = out ?? new Float32Array(16);
  const a00=m[0]!,a01=m[1]!,a02=m[2]!,a03=m[3]!;
  const a10=m[4]!,a11=m[5]!,a12=m[6]!,a13=m[7]!;
  const a20=m[8]!,a21=m[9]!,a22=m[10]!,a23=m[11]!;
  const a30=m[12]!,a31=m[13]!,a32=m[14]!,a33=m[15]!;
  const b00 = a00*a11 - a01*a10, b01 = a00*a12 - a02*a10, b02 = a00*a13 - a03*a10;
  const b03 = a01*a12 - a02*a11, b04 = a01*a13 - a03*a11, b05 = a02*a13 - a03*a12;
  const b06 = a20*a31 - a21*a30, b07 = a20*a32 - a22*a30, b08 = a20*a33 - a23*a30;
  const b09 = a21*a32 - a22*a31, b10 = a21*a33 - a23*a31, b11 = a22*a33 - a23*a32;
  const det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
  if (!det) { o.fill(0); return o; }
  const d = 1 / det;
  o[0] = (a11*b11 - a12*b10 + a13*b09) * d;
  o[1] = (a02*b10 - a01*b11 - a03*b09) * d;
  o[2] = (a31*b05 - a32*b04 + a33*b03) * d;
  o[3] = (a22*b04 - a21*b05 - a23*b03) * d;
  o[4] = (a12*b08 - a10*b11 - a13*b07) * d;
  o[5] = (a00*b11 - a02*b08 + a03*b07) * d;
  o[6] = (a32*b02 - a30*b05 - a33*b01) * d;
  o[7] = (a20*b05 - a22*b02 + a23*b01) * d;
  o[8] = (a10*b10 - a11*b08 + a13*b06) * d;
  o[9] = (a01*b08 - a00*b10 - a03*b06) * d;
  o[10] = (a30*b04 - a31*b02 + a33*b00) * d;
  o[11] = (a21*b02 - a20*b04 - a23*b00) * d;
  o[12] = (a11*b07 - a10*b09 - a12*b06) * d;
  o[13] = (a00*b09 - a01*b07 + a02*b06) * d;
  o[14] = (a31*b01 - a30*b03 - a32*b00) * d;
  o[15] = (a20*b03 - a21*b01 + a22*b00) * d;
  return o;
}
