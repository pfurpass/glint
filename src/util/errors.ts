export class GlintError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
    public readonly source?: { code: string; line?: number; column?: number },
  ) {
    super(message);
    this.name = "GlintError";
  }
}

export class ShaderCompileError extends GlintError {
  constructor(
    public readonly stage: "vertex" | "fragment",
    public readonly backend: "webgpu" | "webgl2",
    message: string,
    hint: string,
    source: { code: string; line?: number; column?: number },
  ) {
    super(message, hint, source);
    this.name = "ShaderCompileError";
  }
}

export function formatShaderError(err: ShaderCompileError): string {
  const { stage, backend, source, hint, message } = err;
  if (!source) {
    return `Shader compile error (${stage}, ${backend})\n  ${message}${hint ? `\n\nHint: ${hint}` : ""}`;
  }
  const lines = source.code.split("\n");
  const ln = source.line ?? 0;
  const radius = 2;
  const from = Math.max(0, ln - radius - 1);
  const to = Math.min(lines.length, ln + radius);
  const snippet: string[] = [];
  const width = String(to).length;
  for (let i = from; i < to; i++) {
    const marker = i + 1 === ln ? ">" : " ";
    const num = String(i + 1).padStart(width, " ");
    snippet.push(`${marker} ${num} | ${lines[i] ?? ""}`);
    if (i + 1 === ln && source.column != null) {
      const indent = Math.max(0, source.column - 1);
      snippet.push(`  ${" ".repeat(width)} | ${" ".repeat(indent)}^`);
    }
  }
  return (
    `Shader compile error (${stage}, ${backend})\n` +
    `  ${message}\n\n` +
    snippet.join("\n") +
    (hint ? `\n\nHint: ${hint}` : "")
  );
}
