export type TokenKind =
  | "ident"
  | "number"
  | "punct"
  | "keyword"
  | "attr"
  | "string"
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS = new Set([
  "fn",
  "let",
  "var",
  "return",
  "struct",
  "if",
  "else",
  "for",
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = source.length;

  const push = (kind: TokenKind, value: string, sl: number, sc: number) => {
    tokens.push({ kind, value, line: sl, column: sc });
  };

  while (i < n) {
    const c = source[i]!;
    const sl = line;
    const sc = col;

    if (c === " " || c === "\t") {
      i++;
      col++;
      continue;
    }
    if (c === "\n") {
      i++;
      line++;
      col = 1;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") {
        i++;
        col++;
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") {
          line++;
          col = 1;
        } else col++;
        i++;
      }
      i += 2;
      continue;
    }

    if (c === "@") {
      i++;
      col++;
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(source[i]!)) {
        i++;
        col++;
      }
      push("attr", source.slice(start, i), sl, sc);
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(source[i]!)) {
        i++;
        col++;
      }
      const value = source.slice(start, i);
      push(KEYWORDS.has(value) ? "keyword" : "ident", value, sl, sc);
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const start = i;
      while (i < n && /[0-9.eE+\-fuih]/.test(source[i]!)) {
        // naive: consume number-ish chars; f suffix allowed.
        const cur = source[i]!;
        if ((cur === "+" || cur === "-") && !/[eE]/.test(source[i - 1] ?? "")) {
          break;
        }
        i++;
        col++;
      }
      push("number", source.slice(start, i), sl, sc);
      continue;
    }

    // multi-char punctuation
    const two = source.slice(i, i + 2);
    if (["->", "==", "!=", "<=", ">=", "&&", "||", "::", "+=", "-=", "*=", "/="].includes(two)) {
      push("punct", two, sl, sc);
      i += 2;
      col += 2;
      continue;
    }
    // single-char punctuation
    if ("(){}[],;:<>+-*/%=.".includes(c)) {
      push("punct", c, sl, sc);
      i++;
      col++;
      continue;
    }

    throw new Error(
      `[glint] shader tokenize: unexpected char '${c}' at line ${line}:${col}`,
    );
  }
  push("eof", "", line, col);
  return tokens;
}
