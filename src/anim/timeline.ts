import { linear, type Easing } from "./easing.js";

interface AnyRec {
  [k: string]: number | number[] | AnyRec | unknown;
}

type NumericKeys<T> = {
  [K in keyof T]: T[K] extends number | number[] ? K : never;
}[keyof T];

export interface TweenOptions<T> {
  /** Target property values. Number or number[]; arrays are interpolated elementwise. */
  to: Partial<Pick<T, NumericKeys<T>>>;
  duration: number;
  delay?: number;
  easing?: Easing;
  onUpdate?: (target: T) => void;
  onComplete?: (target: T) => void;
  /** Loop count; -1 = infinite, default 1. */
  repeat?: number;
  /** If true, reverses each alternate loop. */
  yoyo?: boolean;
}

type FieldDelta = { key: string; from: number; to: number } | { key: string; fromArr: number[]; toArr: number[] };

interface LiveTween {
  target: AnyRec;
  deltas: FieldDelta[];
  duration: number;
  delay: number;
  easing: Easing;
  onUpdate?: (t: AnyRec) => void;
  onComplete?: (t: AnyRec) => void;
  repeat: number;
  yoyo: boolean;
  elapsed: number;
  loopCount: number;
  dead: boolean;
}

export class Timeline {
  private tweens: LiveTween[] = [];
  private paused = false;

  /** Returns a handle you can use to cancel. */
  tween<T extends object>(target: T, options: TweenOptions<T>): { cancel: () => void } {
    const t = target as unknown as AnyRec;
    const deltas: FieldDelta[] = [];
    for (const [key, toVal] of Object.entries(options.to) as [string, number | number[]][]) {
      const fromVal = t[key];
      if (Array.isArray(toVal) && Array.isArray(fromVal)) {
        deltas.push({ key, fromArr: [...(fromVal as number[])], toArr: [...toVal] });
      } else if (typeof toVal === "number" && typeof fromVal === "number") {
        deltas.push({ key, from: fromVal, to: toVal });
      } else {
        throw new Error(`[glint] tween: property '${key}' is not a number or number[]`);
      }
    }
    const live: LiveTween = {
      target: t,
      deltas,
      duration: options.duration,
      delay: options.delay ?? 0,
      easing: options.easing ?? linear,
      ...(options.onUpdate ? { onUpdate: options.onUpdate as (t: AnyRec) => void } : {}),
      ...(options.onComplete ? { onComplete: options.onComplete as (t: AnyRec) => void } : {}),
      repeat: options.repeat ?? 1,
      yoyo: options.yoyo ?? false,
      elapsed: 0,
      loopCount: 0,
      dead: false,
    };
    this.tweens.push(live);
    return {
      cancel() {
        live.dead = true;
      },
    };
  }

  /** Advance all tweens. Call once per frame with the delta time in seconds. */
  step(dt: number): void {
    if (this.paused) return;
    const dtMs = dt * 1000;
    for (const tw of this.tweens) {
      if (tw.dead) continue;
      if (tw.delay > 0) {
        tw.delay -= dtMs;
        if (tw.delay > 0) continue;
      }
      tw.elapsed += dtMs;
      let tNorm = Math.min(tw.elapsed / tw.duration, 1);
      const reversed = tw.yoyo && tw.loopCount % 2 === 1;
      const t = reversed ? 1 - tNorm : tNorm;
      const eased = tw.easing(t);
      for (const d of tw.deltas) {
        if ("fromArr" in d) {
          const arr = tw.target[d.key] as number[];
          for (let i = 0; i < d.toArr.length; i++) {
            arr[i] = d.fromArr[i]! + (d.toArr[i]! - d.fromArr[i]!) * eased;
          }
        } else {
          tw.target[d.key] = d.from + (d.to - d.from) * eased;
        }
      }
      tw.onUpdate?.(tw.target);
      if (tNorm >= 1) {
        tw.loopCount++;
        if (tw.repeat === -1 || tw.loopCount < tw.repeat) {
          tw.elapsed = 0;
        } else {
          tw.onComplete?.(tw.target);
          tw.dead = true;
        }
      }
      void tNorm;
    }
    // reap dead tweens occasionally
    if (this.tweens.length > 64) {
      this.tweens = this.tweens.filter((t) => !t.dead);
    }
  }

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  clear(): void {
    this.tweens = [];
  }
  get activeCount(): number {
    return this.tweens.filter((t) => !t.dead).length;
  }
}
