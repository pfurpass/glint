export type ScalarType = "f32" | "i32" | "u32" | "bool";
export type VecType = "vec2f" | "vec3f" | "vec4f" | "vec2i" | "vec3i" | "vec4i";
export type MatType = "mat3x3f" | "mat4x4f";
export type SamplerType = "sampler";
export type TextureType = "texture_2d_f32";
export type TypeRef =
  | ScalarType
  | VecType
  | MatType
  | SamplerType
  | TextureType
  | { kind: "struct"; name: string };

export interface StructField {
  name: string;
  type: TypeRef;
  attr?: { location?: number; builtin?: "position" };
}

export interface StructDecl {
  kind: "struct";
  name: string;
  fields: StructField[];
}

export interface UniformDecl {
  kind: "uniform";
  group: number;
  binding: number;
  name: string;
  type: TypeRef;
}

export interface FnParam {
  name: string;
  type: TypeRef;
}

export interface FnDecl {
  kind: "fn";
  stage: "vertex" | "fragment" | null;
  name: string;
  params: FnParam[];
  returnType: TypeRef | null;
  returnAttr?: { builtin?: "position"; location?: number };
  body: Stmt[];
  line: number;
}

export type Decl = StructDecl | UniformDecl | FnDecl;

export type Expr =
  | { kind: "num"; value: string; line: number }
  | { kind: "ident"; name: string; line: number }
  | { kind: "field"; target: Expr; name: string; line: number }
  | { kind: "call"; callee: string; args: Expr[]; line: number }
  | {
      kind: "binop";
      op: string;
      left: Expr;
      right: Expr;
      line: number;
    }
  | { kind: "unary"; op: string; arg: Expr; line: number }
  | { kind: "index"; target: Expr; index: Expr; line: number };

export type Stmt =
  | { kind: "let"; name: string; type?: TypeRef; value: Expr; line: number }
  | { kind: "var"; name: string; type?: TypeRef; value: Expr; line: number }
  | { kind: "return"; value?: Expr; line: number }
  | { kind: "assign"; target: Expr; value: Expr; line: number }
  | { kind: "expr"; value: Expr; line: number };

export interface Module {
  structs: StructDecl[];
  uniforms: UniformDecl[];
  fns: FnDecl[];
}
