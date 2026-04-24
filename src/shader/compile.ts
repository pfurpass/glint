import { parseShader, ParseError } from "./parser.js";
import { emitWgsl } from "./emit-wgsl.js";
import { emitGlsl } from "./emit-glsl.js";
import type { Module, UniformDecl } from "./ast.js";
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
  const plainUniforms: UniformDecl[] = [];
  const textures: { name: string; binding: number }[] = [];
  const samplers: { name: string; binding: number }[] = [];
  for (const u of mod.uniforms) {
    if (u.type === "texture_2d_f32") {
      textures.push({ name: u.name, binding: u.binding });
    } else if (u.type === "sampler") {
      samplers.push({ name: u.name, binding: u.binding });
    } else if (typeof u.type === "object") {
      throw new GlintError(
        `Uniform '${u.name}' uses a struct type. Milestone 2 supports only top-level scalar/vec/mat uniforms.`,
        "Declare each member as its own @group/@binding var<uniform>.",
        { code: source },
      );
    } else {
      plainUniforms.push(u);
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
