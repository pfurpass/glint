import type {
  Expr,
  FnDecl,
  Module,
  Stmt,
  StructDecl,
  TypeRef,
} from "./ast.js";

function glslType(t: TypeRef): string {
  if (typeof t === "string") {
    switch (t) {
      case "f32":
        return "float";
      case "i32":
        return "int";
      case "u32":
        return "uint";
      case "bool":
        return "bool";
      case "vec2f":
        return "vec2";
      case "vec3f":
        return "vec3";
      case "vec4f":
        return "vec4";
      case "vec2i":
        return "ivec2";
      case "vec3i":
        return "ivec3";
      case "vec4i":
        return "ivec4";
      case "mat3x3f":
        return "mat3";
      case "mat4x4f":
        return "mat4";
      case "sampler":
        return "/*sampler*/";
      case "texture_2d_f32":
        return "sampler2D";
    }
  }
  return t.name;
}

const CALL_REWRITE: Record<string, string> = {
  vec2f: "vec2",
  vec3f: "vec3",
  vec4f: "vec4",
  vec2i: "ivec2",
  vec3i: "ivec3",
  vec4i: "ivec4",
  mat3x3f: "mat3",
  mat4x4f: "mat4",
};

function emitExpr(e: Expr, ctx: Ctx): string {
  switch (e.kind) {
    case "num": {
      // strip WGSL f/u/i suffix
      const v = e.value.replace(/[fuih]$/i, "");
      if (/^[0-9]+$/.test(v)) return v + ".0"; // avoid implicit-int pitfalls in GLSL expressions
      return v;
    }
    case "ident":
      return ctx.rewriteIdent(e.name);
    case "field": {
      const base = emitExpr(e.target, ctx);
      return `${base}.${e.name}`;
    }
    case "index":
      return `${emitExpr(e.target, ctx)}[${emitExpr(e.index, ctx)}]`;
    case "call": {
      // textureSample(tex, samp, uv) -> texture(tex, uv)
      if (e.callee === "textureSample") {
        const tex = emitExpr(e.args[0]!, ctx);
        const uv = emitExpr(e.args[2]!, ctx);
        return `texture(${tex}, ${uv})`;
      }
      const name = CALL_REWRITE[e.callee] ?? e.callee;
      return `${name}(${e.args.map((a) => emitExpr(a, ctx)).join(", ")})`;
    }
    case "binop":
      return `(${emitExpr(e.left, ctx)} ${e.op} ${emitExpr(e.right, ctx)})`;
    case "unary":
      return `(${e.op}${emitExpr(e.arg, ctx)})`;
  }
}

interface Ctx {
  stage: "vertex" | "fragment";
  /** Inputs that were exposed via the stage-input struct; their accesses get rewritten. */
  inputAliases: Map<string, string>; // local var field path -> global name
  /** Name of the stage-input variable (e.g., "in") to rewrite `in.foo` -> `a_foo`. */
  inputParamName?: string;
  /** Name used for the output struct local variable in fn body, to rewrite `out.foo` -> `v_foo` / `gl_Position`. */
  outputVarName?: string;
  outputBuiltin?: string; // e.g., "position"
  outputFields: Map<string, { glslName: string; isPosition: boolean }>;
  uniforms: Set<string>;
  rewriteIdent(name: string): string;
}

function emitStmt(s: Stmt, ctx: Ctx): string {
  switch (s.kind) {
    case "let":
    case "var": {
      // Output-struct construction like `var out: VSOut;` — skip, we use globals.
      if (
        s.type &&
        typeof s.type !== "string" &&
        s.type.kind === "struct" &&
        ctx.outputVarName === s.name
      ) {
        return ``;
      }
      const kw = "";
      const t = s.type ? glslType(s.type) + " " : "";
      return `  ${kw}${t || "float "}${s.name} = ${emitExpr(s.value, ctx)};`;
    }
    case "return": {
      if (ctx.stage === "fragment") {
        if (!s.value) return "  return;";
        return `  fragColor = ${emitExpr(s.value, ctx)};`;
      }
      // vertex stage: return is implicit via gl_Position + varyings already written during out.* assigns
      return "  return;";
    }
    case "assign": {
      // rewrite `out.foo = X` -> varying or gl_Position
      if (
        s.target.kind === "field" &&
        s.target.target.kind === "ident" &&
        s.target.target.name === ctx.outputVarName
      ) {
        const info = ctx.outputFields.get(s.target.name);
        if (info) {
          const lhs = info.isPosition ? "gl_Position" : info.glslName;
          return `  ${lhs} = ${emitExpr(s.value, ctx)};`;
        }
      }
      return `  ${emitExpr(s.target, ctx)} = ${emitExpr(s.value, ctx)};`;
    }
    case "expr":
      return `  ${emitExpr(s.value, ctx)};`;
  }
}

function structByName(mod: Module, name: string): StructDecl | undefined {
  return mod.structs.find((s) => s.name === name);
}

function emitDeclarations(
  mod: Module,
  stage: "vertex" | "fragment",
  fn: FnDecl,
): { decls: string[]; ctx: Ctx } {
  const decls: string[] = [];

  // Uniforms (per-member as plain uniforms, one per struct field, GLSL has no UBO interop needed for milestone 1).
  const uniformNames = new Set<string>();
  for (const u of mod.uniforms) {
    const typeRef = u.type;
    if (typeRef === "sampler") {
      // GLSL: no standalone sampler; handled by sampler2D below and bound to same unit.
      continue;
    }
    if (typeof typeRef === "object" && typeRef.kind === "struct") {
      const s = structByName(mod, typeRef.name);
      if (!s) continue;
      for (const f of s.fields) {
        const glslName = `${u.name}_${f.name}`;
        uniformNames.add(glslName);
        decls.push(`uniform ${glslType(f.type)} ${glslName};`);
      }
    } else {
      uniformNames.add(u.name);
      decls.push(`uniform ${glslType(typeRef)} ${u.name};`);
    }
  }

  // Inputs + outputs derived from function signature (stage-input struct parameter, stage-output return struct).
  const inputAliases = new Map<string, string>();
  let inputParamName: string | undefined;
  if (fn.params.length > 0) {
    const p = fn.params[0]!;
    inputParamName = p.name;
    if (typeof p.type === "object" && p.type.kind === "struct") {
      const s = structByName(mod, p.type.name);
      if (s) {
        for (const f of s.fields) {
          if (stage === "vertex") {
            if (f.attr?.location != null) {
              const glslName = `a_${f.name}`;
              decls.push(
                `layout(location = ${f.attr.location}) in ${glslType(f.type)} ${glslName};`,
              );
              inputAliases.set(f.name, glslName);
            }
          } else {
            // fragment: location inputs become varyings
            if (f.attr?.location != null) {
              const glslName = `v_${f.name}`;
              decls.push(`in ${glslType(f.type)} ${glslName};`);
              inputAliases.set(f.name, glslName);
            }
            if (f.attr?.builtin === "position") {
              inputAliases.set(f.name, "gl_FragCoord");
            }
          }
        }
      }
    }
  }

  // Outputs
  const outputFields = new Map<
    string,
    { glslName: string; isPosition: boolean }
  >();
  let outputVarName: string | undefined;
  if (fn.returnType) {
    if (typeof fn.returnType === "object" && fn.returnType.kind === "struct") {
      const s = structByName(mod, fn.returnType.name);
      if (s) {
        // find var `out: VSOut;` inside body (convention)
        for (const st of fn.body) {
          if (
            (st.kind === "var" || st.kind === "let") &&
            st.type &&
            typeof st.type === "object" &&
            st.type.kind === "struct" &&
            st.type.name === s.name
          ) {
            outputVarName = st.name;
            break;
          }
        }
        for (const f of s.fields) {
          if (f.attr?.builtin === "position") {
            outputFields.set(f.name, {
              glslName: "gl_Position",
              isPosition: true,
            });
          } else if (f.attr?.location != null) {
            const glslName = `v_${f.name}`;
            decls.push(`out ${glslType(f.type)} ${glslName};`);
            outputFields.set(f.name, { glslName, isPosition: false });
          }
        }
      }
    } else if (stage === "fragment") {
      decls.push(`out vec4 fragColor;`);
    }
  }
  if (stage === "fragment" && !decls.some((d) => d.includes("out vec4"))) {
    decls.push(`out vec4 fragColor;`);
  }

  const ctx: Ctx = {
    stage,
    inputAliases,
    ...(inputParamName != null ? { inputParamName } : {}),
    ...(outputVarName != null ? { outputVarName } : {}),
    outputFields,
    uniforms: uniformNames,
    rewriteIdent(name: string): string {
      return name;
    },
  };

  ctx.rewriteIdent = (name: string): string => {
    if (ctx.uniforms.has(name)) return name;
    return name;
  };

  return { decls, ctx };
}

function emitFnBody(fn: FnDecl, ctx: Ctx, mod: Module): string {
  // Walk body: rewrite expressions like `in.foo` -> alias, and `uni.field` -> `uni_field`.
  function rewriteExpr(e: Expr): Expr {
    if (e.kind === "field") {
      if (
        e.target.kind === "ident" &&
        e.target.name === ctx.inputParamName &&
        ctx.inputAliases.has(e.name)
      ) {
        return {
          kind: "ident",
          name: ctx.inputAliases.get(e.name)!,
          line: e.line,
        };
      }
      // uniform struct access: u.mvp -> u_mvp
      if (e.target.kind === "ident") {
        const uni = mod.uniforms.find((x) => x.name === e.target.kind);
        void uni;
      }
      if (
        e.target.kind === "ident" &&
        mod.uniforms.some((u) => u.name === (e.target as { name: string }).name)
      ) {
        const base = (e.target as { name: string }).name;
        return {
          kind: "ident",
          name: `${base}_${e.name}`,
          line: e.line,
        };
      }
      return { ...e, target: rewriteExpr(e.target) };
    }
    if (e.kind === "call") {
      return { ...e, args: e.args.map(rewriteExpr) };
    }
    if (e.kind === "binop") {
      return { ...e, left: rewriteExpr(e.left), right: rewriteExpr(e.right) };
    }
    if (e.kind === "unary") {
      return { ...e, arg: rewriteExpr(e.arg) };
    }
    if (e.kind === "index") {
      return {
        ...e,
        target: rewriteExpr(e.target),
        index: rewriteExpr(e.index),
      };
    }
    return e;
  }
  function rewriteStmt(s: Stmt): Stmt {
    switch (s.kind) {
      case "let":
      case "var":
        return { ...s, value: rewriteExpr(s.value) };
      case "return":
        return s.value ? { ...s, value: rewriteExpr(s.value) } : s;
      case "assign":
        return {
          ...s,
          target: rewriteExpr(s.target),
          value: rewriteExpr(s.value),
        };
      case "expr":
        return { ...s, value: rewriteExpr(s.value) };
    }
  }
  const lines = fn.body
    .map(rewriteStmt)
    .map((s) => emitStmt(s, ctx))
    .filter((l) => l.length > 0);
  return lines.join("\n");
}

export interface GlslOutput {
  vertex: string;
  fragment: string;
}

export function emitGlsl(mod: Module): GlslOutput {
  const vsFn = mod.fns.find((f) => f.stage === "vertex");
  const fsFn = mod.fns.find((f) => f.stage === "fragment");
  if (!vsFn) throw new Error("[glint] shader: no @vertex function found");
  if (!fsFn) throw new Error("[glint] shader: no @fragment function found");

  const vs = emitDeclarations(mod, "vertex", vsFn);
  const fs = emitDeclarations(mod, "fragment", fsFn);

  const header = "#version 300 es\nprecision highp float;\nprecision highp int;\n";

  const vertex =
    header +
    vs.decls.join("\n") +
    "\n\nvoid main() {\n" +
    emitFnBody(vsFn, vs.ctx, mod) +
    "\n}\n";

  const fragment =
    header +
    fs.decls.join("\n") +
    "\n\nvoid main() {\n" +
    emitFnBody(fsFn, fs.ctx, mod) +
    "\n}\n";

  return { vertex, fragment };
}
