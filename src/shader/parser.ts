import { tokenize, type Token } from "./tokens.js";
import type {
  Decl,
  Expr,
  FnDecl,
  FnParam,
  Module,
  Stmt,
  StructDecl,
  StructField,
  TypeRef,
  UniformDecl,
} from "./ast.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly hint: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

class Parser {
  private i = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(off = 0): Token {
    return this.tokens[this.i + off]!;
  }
  private eat(): Token {
    return this.tokens[this.i++]!;
  }
  private expect(kind: Token["kind"], value?: string, hint = ""): Token {
    const t = this.peek();
    if (t.kind !== kind || (value != null && t.value !== value)) {
      throw new ParseError(
        `expected ${value ?? kind}, got '${t.value || t.kind}'`,
        t.line,
        t.column,
        hint || `insert '${value ?? kind}' here`,
      );
    }
    return this.eat();
  }
  private match(kind: Token["kind"], value?: string): boolean {
    const t = this.peek();
    if (t.kind !== kind) return false;
    if (value != null && t.value !== value) return false;
    this.eat();
    return true;
  }

  parse(): Module {
    const mod: Module = { structs: [], uniforms: [], fns: [] };
    while (this.peek().kind !== "eof") {
      const decl = this.parseTopLevel();
      if (decl.kind === "struct") mod.structs.push(decl);
      else if (decl.kind === "uniform") mod.uniforms.push(decl);
      else mod.fns.push(decl);
    }
    return mod;
  }

  private parseTopLevel(): Decl {
    // attributes: @vertex @fragment @group(X) @binding(Y)
    const attrs: { name: string; args: string[] }[] = [];
    while (this.peek().kind === "attr") {
      const t = this.eat();
      const args: string[] = [];
      if (this.match("punct", "(")) {
        while (!this.match("punct", ")")) {
          args.push(this.eat().value);
          this.match("punct", ",");
        }
      }
      attrs.push({ name: t.value, args });
    }
    const t = this.peek();
    if (t.kind === "keyword" && t.value === "struct") {
      return this.parseStruct();
    }
    if (t.kind === "keyword" && t.value === "var") {
      return this.parseUniform(attrs);
    }
    if (t.kind === "keyword" && t.value === "fn") {
      return this.parseFn(attrs);
    }
    throw new ParseError(
      `unexpected top-level token '${t.value || t.kind}'`,
      t.line,
      t.column,
      "expected 'struct', 'fn', or 'var' at top level",
    );
  }

  private parseStruct(): StructDecl {
    this.expect("keyword", "struct");
    const name = this.expect("ident").value;
    this.expect("punct", "{");
    const fields: StructField[] = [];
    while (!this.match("punct", "}")) {
      const field: StructField = { name: "", type: "f32" as TypeRef };
      while (this.peek().kind === "attr") {
        const t = this.eat();
        const args: string[] = [];
        if (this.match("punct", "(")) {
          while (!this.match("punct", ")")) {
            args.push(this.eat().value);
            this.match("punct", ",");
          }
        }
        if (t.value === "location" && args[0] != null) {
          field.attr = { ...field.attr, location: parseInt(args[0], 10) };
        } else if (t.value === "builtin" && args[0] === "position") {
          field.attr = { ...field.attr, builtin: "position" };
        }
      }
      field.name = this.expect("ident").value;
      this.expect("punct", ":");
      field.type = this.parseType();
      this.match("punct", ",");
      this.match("punct", ";");
      fields.push(field);
    }
    this.match("punct", ";"); // optional trailing ;
    return { kind: "struct", name, fields };
  }

  private parseUniform(
    attrs: { name: string; args: string[] }[],
  ): UniformDecl {
    let group = 0;
    let binding = 0;
    for (const a of attrs) {
      if (a.name === "group" && a.args[0] != null) group = parseInt(a.args[0]);
      if (a.name === "binding" && a.args[0] != null)
        binding = parseInt(a.args[0]);
    }
    this.expect("keyword", "var");
    // optional <uniform>
    if (this.match("punct", "<")) {
      this.expect("ident");
      this.expect("punct", ">");
    }
    const name = this.expect("ident").value;
    this.expect("punct", ":");
    const type = this.parseType();
    this.expect("punct", ";");
    return { kind: "uniform", group, binding, name, type };
  }

  private parseFn(attrs: { name: string; args: string[] }[]): FnDecl {
    let stage: FnDecl["stage"] = null;
    for (const a of attrs) {
      if (a.name === "vertex") stage = "vertex";
      if (a.name === "fragment") stage = "fragment";
    }
    const fnToken = this.expect("keyword", "fn");
    const name = this.expect("ident").value;
    this.expect("punct", "(");
    const params: FnParam[] = [];
    while (!this.match("punct", ")")) {
      // consume and ignore param attrs (e.g., @location)
      while (this.peek().kind === "attr") {
        this.eat();
        if (this.match("punct", "(")) {
          while (!this.match("punct", ")")) this.eat();
        }
      }
      const pname = this.expect("ident").value;
      this.expect("punct", ":");
      const ptype = this.parseType();
      params.push({ name: pname, type: ptype });
      this.match("punct", ",");
    }
    let returnType: TypeRef | null = null;
    const returnAttr: FnDecl["returnAttr"] = {};
    if (this.match("punct", "->")) {
      while (this.peek().kind === "attr") {
        const t = this.eat();
        const args: string[] = [];
        if (this.match("punct", "(")) {
          while (!this.match("punct", ")")) {
            args.push(this.eat().value);
            this.match("punct", ",");
          }
        }
        if (t.value === "builtin" && args[0] === "position")
          returnAttr.builtin = "position";
        if (t.value === "location" && args[0] != null)
          returnAttr.location = parseInt(args[0]);
      }
      returnType = this.parseType();
    }
    const body = this.parseBlock();
    return {
      kind: "fn",
      stage,
      name,
      params,
      returnType,
      returnAttr,
      body,
      line: fnToken.line,
    };
  }

  private parseType(): TypeRef {
    const t = this.expect("ident");
    const name = t.value;
    const basic: Record<string, TypeRef> = {
      f32: "f32",
      i32: "i32",
      u32: "u32",
      bool: "bool",
      vec2f: "vec2f",
      vec3f: "vec3f",
      vec4f: "vec4f",
      vec2i: "vec2i",
      vec3i: "vec3i",
      vec4i: "vec4i",
      mat3x3f: "mat3x3f",
      mat4x4f: "mat4x4f",
      sampler: "sampler",
      texture_2d: "texture_2d_f32",
    };
    if (name === "texture_2d") {
      if (this.match("punct", "<")) {
        this.eat();
        this.expect("punct", ">");
      }
      return "texture_2d_f32";
    }
    if (basic[name]) return basic[name]!;
    return { kind: "struct", name };
  }

  private parseBlock(): Stmt[] {
    this.expect("punct", "{");
    const stmts: Stmt[] = [];
    while (!this.match("punct", "}")) {
      stmts.push(this.parseStmt());
    }
    return stmts;
  }

  private parseStmt(): Stmt {
    const t = this.peek();
    if (t.kind === "keyword" && (t.value === "let" || t.value === "var")) {
      const kw = this.eat();
      const name = this.expect("ident").value;
      let type: TypeRef | undefined;
      if (this.match("punct", ":")) {
        type = this.parseType();
      }
      let value: Expr;
      if (this.match("punct", "=")) {
        value = this.parseExpr();
      } else {
        // no initializer: placeholder, consumers that care handle their own defaults
        value = { kind: "ident", name: "__uninit", line: kw.line };
      }
      this.expect("punct", ";");
      return {
        kind: kw.value as "let" | "var",
        name,
        ...(type != null ? { type } : {}),
        value,
        line: kw.line,
      };
    }
    if (t.kind === "keyword" && t.value === "return") {
      const kw = this.eat();
      if (this.match("punct", ";"))
        return { kind: "return", line: kw.line };
      const v = this.parseExpr();
      this.expect("punct", ";");
      return { kind: "return", value: v, line: kw.line };
    }
    // assignment or expression
    const expr = this.parseExpr();
    if (this.match("punct", "=")) {
      const value = this.parseExpr();
      this.expect("punct", ";");
      return { kind: "assign", target: expr, value, line: t.line };
    }
    this.expect("punct", ";");
    return { kind: "expr", value: expr, line: t.line };
  }

  // expression parsing with precedence
  private parseExpr(): Expr {
    return this.parseAdd();
  }
  private parseAdd(): Expr {
    let left = this.parseMul();
    while (
      this.peek().kind === "punct" &&
      (this.peek().value === "+" || this.peek().value === "-")
    ) {
      const op = this.eat().value;
      const right = this.parseMul();
      left = { kind: "binop", op, left, right, line: left.line };
    }
    return left;
  }
  private parseMul(): Expr {
    let left = this.parseUnary();
    while (
      this.peek().kind === "punct" &&
      (this.peek().value === "*" || this.peek().value === "/")
    ) {
      const op = this.eat().value;
      const right = this.parseUnary();
      left = { kind: "binop", op, left, right, line: left.line };
    }
    return left;
  }
  private parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === "punct" && (t.value === "-" || t.value === "+")) {
      const op = this.eat().value;
      const arg = this.parseUnary();
      return { kind: "unary", op, arg, line: t.line };
    }
    return this.parsePostfix();
  }
  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      if (this.match("punct", ".")) {
        const name = this.expect("ident").value;
        e = { kind: "field", target: e, name, line: e.line };
      } else if (this.match("punct", "[")) {
        const idx = this.parseExpr();
        this.expect("punct", "]");
        e = { kind: "index", target: e, index: idx, line: e.line };
      } else {
        break;
      }
    }
    return e;
  }
  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.kind === "number") {
      this.eat();
      return { kind: "num", value: t.value, line: t.line };
    }
    if (t.kind === "ident") {
      this.eat();
      if (this.match("punct", "(")) {
        const args: Expr[] = [];
        if (!this.match("punct", ")")) {
          args.push(this.parseExpr());
          while (this.match("punct", ",")) args.push(this.parseExpr());
          this.expect("punct", ")");
        }
        return { kind: "call", callee: t.value, args, line: t.line };
      }
      return { kind: "ident", name: t.value, line: t.line };
    }
    if (t.kind === "punct" && t.value === "(") {
      this.eat();
      const e = this.parseExpr();
      this.expect("punct", ")");
      return e;
    }
    throw new ParseError(
      `unexpected token '${t.value || t.kind}' in expression`,
      t.line,
      t.column,
      "expected a number, identifier, or '('",
    );
  }
}

export function parseShader(source: string): Module {
  const tokens = tokenize(source);
  return new Parser(tokens).parse();
}
