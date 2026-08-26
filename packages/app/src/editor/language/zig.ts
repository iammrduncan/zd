import { LanguageSupport, StreamLanguage, type StringStream } from "@codemirror/language";

const KEYWORDS = new Set([
  "addrspace",
  "align",
  "allowzero",
  "and",
  "anyframe",
  "anytype",
  "asm",
  "async",
  "await",
  "break",
  "callconv",
  "catch",
  "comptime",
  "const",
  "continue",
  "defer",
  "else",
  "enum",
  "errdefer",
  "error",
  "export",
  "extern",
  "fn",
  "for",
  "if",
  "inline",
  "linksection",
  "noalias",
  "noinline",
  "nosuspend",
  "opaque",
  "or",
  "orelse",
  "packed",
  "pub",
  "resume",
  "return",
  "struct",
  "suspend",
  "switch",
  "test",
  "threadlocal",
  "try",
  "union",
  "unreachable",
  "usingnamespace",
  "var",
  "volatile",
  "while",
]);

const TYPES = new Set([
  "anyerror",
  "anyopaque",
  "bool",
  "c_int",
  "c_long",
  "c_longdouble",
  "c_longlong",
  "c_short",
  "c_uint",
  "c_ulong",
  "c_ulonglong",
  "c_ushort",
  "comptime_float",
  "comptime_int",
  "f16",
  "f32",
  "f64",
  "f80",
  "f128",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "isize",
  "noreturn",
  "type",
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "usize",
  "void",
]);

function quoted(stream: StringStream, delimiter: string): void {
  let escaped = false;
  while (!stream.eol()) {
    const character = stream.next();
    if (character === delimiter && !escaped) return;
    escaped = !escaped && character === "\\";
  }
}

const zig = StreamLanguage.define<null>({
  name: "zig",
  startState: () => null,
  token(stream) {
    if (stream.sol() && stream.match(/\s*\\\\/)) {
      stream.skipToEnd();
      return "string";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "lineComment";
    }

    const next = stream.peek();
    if (next === '"' || next === "'") {
      stream.next();
      quoted(stream, next);
      return next === '"' ? "string" : "character";
    }
    if (stream.match(/@[A-Za-z_][A-Za-z0-9_]*/)) return "variableName.function";
    if (
      stream.match(/(?:0[xX][0-9A-Fa-f_]+|0[bB][01_]+|\d(?:[\d_]*\.?[\d_]*)(?:[eEpP][+-]?[\d_]+)?)/)
    ) {
      return "number";
    }

    const identifier = stream.match(/[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier && typeof identifier !== "boolean") {
      const word = identifier[0];
      if (KEYWORDS.has(word)) return "keyword";
      if (TYPES.has(word)) return "typeName";
      if (["false", "true"].includes(word)) return "bool";
      if (["null", "undefined"].includes(word)) return "null";

      const rest = stream.string.slice(stream.pos);
      return /^\s*\(/.test(rest) ? "variableName.function" : "variableName";
    }
    if (stream.match(/[-+/*%=!<>|&^~?:]+/)) return "operator";
    if (stream.match(/[()[\]{},.;]/)) return "punctuation";

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "[", "{", "'", '"'] },
  },
});

export function zigLanguage(): LanguageSupport {
  return new LanguageSupport(zig);
}
