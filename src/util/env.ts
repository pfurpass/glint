declare const process: { env?: Record<string, string | undefined> } | undefined;

export const DEV: boolean =
  typeof process !== "undefined"
    ? process?.env?.["NODE_ENV"] !== "production"
    : true;

export function assert(cond: unknown, msg: string): asserts cond {
  if (DEV && !cond) throw new Error(`[glint] ${msg}`);
}
