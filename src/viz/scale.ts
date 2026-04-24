export interface Scale {
  (value: number): number;
  domain(d: [number, number]): Scale;
  range(r: [number, number]): Scale;
  readonly _domain: [number, number];
  readonly _range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  let d = domain;
  let r = range;
  const fn = ((value: number): number => {
    const [d0, d1] = d;
    const [r0, r1] = r;
    const t = (value - d0) / (d1 - d0 || 1);
    return r0 + t * (r1 - r0);
  }) as Scale;
  Object.defineProperty(fn, "_domain", { get: () => d });
  Object.defineProperty(fn, "_range", { get: () => r });
  fn.domain = (nd) => {
    d = nd;
    return fn;
  };
  fn.range = (nr) => {
    r = nr;
    return fn;
  };
  return fn;
}

export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / pow;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * pow;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}
