import type {
  Expr,
  FnDecl,
  Module,
  Stmt,
  StructDecl,
  TypeRef,
  UniformDecl,
} from "./ast.js";

function typeStr(t: TypeRef): string {
  if (typeof t === "string") {
    if (t === "texture_2d_f32") return "texture_2d<f32>";
    return t;
  }
  return t.name;
}

function emitStruct(s: StructDecl): string {
  const fields = s.fields.map((f) => {
    const attrs: string[] = [];
    if (f.attr?.builtin) attrs.push(`@builtin(${f.attr.builtin})`);
    if (f.attr?.location != null) attrs.push(`@location(${f.attr.location})`);
    return `  ${attrs.join(" ")} ${f.name}: ${typeStr(f.type)},`;
  });
  return `struct ${s.name} {\n${fields.join("\n")}\n};`;
}

function emitUniform(u: UniformDecl): string {
  const isResource = u.type === "sampler" || u.type === "texture_2d_f32";
  const storage = isResource ? "" : "<uniform>";
  return `@group(${u.group}) @binding(${u.binding}) var${storage} ${u.name}: ${typeStr(u.type)};`;
}

function emitExpr(e: Expr): string {
  switch (e.kind) {
    case "num":
      return e.value;
    case "ident":
      return e.name;
    case "field":
      return `${emitExpr(e.target)}.${e.name}`;
    case "index":
      return `${emitExpr(e.target)}[${emitExpr(e.index)}]`;
    case "call":
      return `${e.callee}(${e.args.map(emitExpr).join(", ")})`;
    case "binop":
      return `(${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)})`;
    case "unary":
      return `(${e.op}${emitExpr(e.arg)})`;
  }
}

function isUninit(e: { kind: string; name?: string }): boolean {
  return e.kind === "ident" && e.name === "__uninit";
}

function emitStmt(s: Stmt): string {
  switch (s.kind) {
    case "let":
    case "var":
      if (isUninit(s.value)) {
        return `  ${s.kind} ${s.name}${s.type ? `: ${typeStr(s.type)}` : ""};`;
      }
      return `  ${s.kind} ${s.name}${s.type ? `: ${typeStr(s.type)}` : ""} = ${emitExpr(s.value)};`;
    case "return":
      return s.value ? `  return ${emitExpr(s.value)};` : "  return;";
    case "assign":
      return `  ${emitExpr(s.target)} = ${emitExpr(s.value)};`;
    case "expr":
      return `  ${emitExpr(s.value)};`;
  }
}

function emitFn(f: FnDecl): string {
  const stage = f.stage ? `@${f.stage} ` : "";
  const params = f.params.map((p) => `${p.name}: ${typeStr(p.type)}`).join(", ");
  let ret = "";
  if (f.returnType) {
    const attrs: string[] = [];
    if (f.returnAttr?.builtin) attrs.push(`@builtin(${f.returnAttr.builtin})`);
    if (f.returnAttr?.location != null)
      attrs.push(`@location(${f.returnAttr.location})`);
    ret = ` -> ${attrs.join(" ")} ${typeStr(f.returnType)}`.replace(/  +/g, " ");
  }
  const body = f.body.map(emitStmt).join("\n");
  return `${stage}fn ${f.name}(${params})${ret} {\n${body}\n}`;
}

export function emitWgsl(mod: Module): string {
  const parts: string[] = [];
  for (const s of mod.structs) parts.push(emitStruct(s));
  for (const u of mod.uniforms) parts.push(emitUniform(u));
  for (const f of mod.fns) parts.push(emitFn(f));
  return parts.join("\n\n") + "\n";
}
