import { parseShader, ParseError } from "./parser.js";
import { emitWgsl } from "./emit-wgsl.js";
import { emitGlsl } from "./emit-glsl.js";
import type { Expr, FnDecl, Module, Stmt, UniformDecl } from "./ast.js";
import { GlintError } from "../util/errors.js";

export interface CompiledShader {
  wgsl: { vertex: string; fragment: string };
  glsl: { vertex: string; fragment: string };
  /** plain scalar/vec/mat uniforms (UBO members in WGSL, individual uniforms in GLSL) */
  uniforms: UniformDecl[];
  /** texture_2d bindings */
  textures: { name: string; binding: number }[];
  /** sampler bindings */
  samplers: { name: string; binding: number }[];
  vertexInputs: { name: string; location: number; type: string }[];
  source: string;
}

export function compileShader(source: string): CompiledShader {
  let mod: Module;
  try {
    mod = parseShader(source);
  } catch (e) {
    if (e instanceof ParseError) {
      throw new GlintError(`Shader parse error: ${e.message}`, e.hint, {
        code: source,
        line: e.line,
        column: e.column,
      });
    }
    throw e;
  }

  const vsFn = mod.fns.find((f) => f.stage === "vertex");
  const fsFn = mod.fns.find((f) => f.stage === "fragment");
  if (!vsFn) {
    throw new GlintError(
      "Shader missing @vertex function",
      "Annotate exactly one function with @vertex and one with @fragment.",
      { code: source },
    );
  }
  if (!fsFn) {
    throw new GlintError(
      "Shader missing @fragment function",
      "Annotate exactly one function with @fragment.",
      { code: source },
    );
  }

  // derive vertex inputs from the input struct of the vertex fn
  const vertexInputs: { name: string; location: number; type: string }[] = [];
  const firstParam = vsFn.params[0];
  if (firstParam && typeof firstParam.type === "object") {
    const s = mod.structs.find((x) => x.name === (firstParam.type as { name: string }).name);
    if (s) {
      for (const f of s.fields) {
        if (f.attr?.location != null) {
          vertexInputs.push({
            name: f.name,
            location: f.attr.location,
            type: typeof f.type === "string" ? f.type : f.type.name,
          });
        }
      }
    }
  }

  // Split `uniforms` into plain-data uniforms, texture bindings, and sampler bindings.
  // Struct-typed uniforms are expanded to synthetic per-field uniforms (name: `u_field`)
  // at contiguous bindings starting from the struct's declared binding, and every
  // `u.field` access is rewritten to `u_field` in the module AST.
  const plainUniforms: UniformDecl[] = [];
  const textures: { name: string; binding: number }[] = [];
  const samplers: { name: string; binding: number }[] = [];
  const newUniformList: UniformDecl[] = [];
  const rewriteMap = new Map<string, string>(); // "structVar.field" -> "structVar_field"
  let nextBinding = 0;
  for (const u of mod.uniforms) {
    nextBinding = Math.max(nextBinding, u.binding + 1);
  }
  for (const u of mod.uniforms) {
    if (u.type === "texture_2d_f32") {
      textures.push({ name: u.name, binding: u.binding });
      newUniformList.push(u);
      continue;
    }
    if (u.type === "sampler") {
      samplers.push({ name: u.name, binding: u.binding });
      newUniformList.push(u);
      continue;
    }
    if (typeof u.type === "object") {
      const s = mod.structs.find((x) => x.name === (u.type as { name: string }).name);
      if (!s) {
        throw new GlintError(
          `Uniform '${u.name}' references unknown struct '${(u.type as { name: string }).name}'`,
          "Declare the struct before using it in a uniform.",
          { code: source },
        );
      }
      // First field stays at the struct's binding; subsequent fields use fresh bindings.
      let bindingForField = u.binding;
      for (let fi = 0; fi < s.fields.length; fi++) {
        const f = s.fields[fi]!;
        if (typeof f.type === "object") {
          throw new GlintError(
            `Nested struct field '${u.name}.${f.name}' not supported.`,
            "Flatten the struct or split into multiple uniforms.",
            { code: source },
          );
        }
        const syntheticName = `${u.name}_${f.name}`;
        const synth: UniformDecl = {
          kind: "uniform",
          group: u.group,
          binding: fi === 0 ? bindingForField : nextBinding++,
          name: syntheticName,
          type: f.type,
        };
        newUniformList.push(synth);
        plainUniforms.push(synth);
        rewriteMap.set(`${u.name}.${f.name}`, syntheticName);
      }
      continue;
    }
    plainUniforms.push(u);
    newUniformList.push(u);
  }

  // Replace module uniforms with flattened list.
  mod.uniforms = newUniformList;

  // Rewrite expressions `structVar.field` -> `structVar_field` in every fn body.
  if (rewriteMap.size > 0) {
    const rewriteExpr = (e: Expr): Expr => {
      if (e.kind === "field" && e.target.kind === "ident") {
        const key = `${e.target.name}.${e.name}`;
        const mapped = rewriteMap.get(key);
        if (mapped) return { kind: "ident", name: mapped, line: e.line };
      }
      if (e.kind === "field") return { ...e, target: rewriteExpr(e.target) };
      if (e.kind === "call") return { ...e, args: e.args.map(rewriteExpr) };
      if (e.kind === "binop") return { ...e, left: rewriteExpr(e.left), right: rewriteExpr(e.right) };
      if (e.kind === "unary") return { ...e, arg: rewriteExpr(e.arg) };
      if (e.kind === "index") return { ...e, target: rewriteExpr(e.target), index: rewriteExpr(e.index) };
      return e;
    };
    const rewriteStmt = (s: Stmt): Stmt => {
      switch (s.kind) {
        case "let":
        case "var":
          return { ...s, value: rewriteExpr(s.value) };
        case "return":
          return s.value ? { ...s, value: rewriteExpr(s.value) } : s;
        case "assign":
          return { ...s, target: rewriteExpr(s.target), value: rewriteExpr(s.value) };
        case "expr":
          return { ...s, value: rewriteExpr(s.value) };
        case "if":
          return {
            ...s,
            cond: rewriteExpr(s.cond),
            then: s.then.map(rewriteStmt),
            ...(s.else ? { else: s.else.map(rewriteStmt) } : {}),
          };
        case "for":
          return {
            ...s,
            init: rewriteStmt(s.init),
            cond: rewriteExpr(s.cond),
            update: rewriteStmt(s.update),
            body: s.body.map(rewriteStmt),
          };
      }
    };
    for (const fn of mod.fns) {
      const rewritten: FnDecl = { ...fn, body: fn.body.map(rewriteStmt) };
      Object.assign(fn, rewritten);
    }
  }

  const wgslAll = emitWgsl(mod);
  const wgsl = { vertex: wgslAll, fragment: wgslAll };
  const glsl = emitGlsl(mod);

  return {
    wgsl,
    glsl,
    uniforms: plainUniforms,
    textures,
    samplers,
    vertexInputs,
    source,
  };
}
