import type {
  FileCategory,
  FileGitState,
  FileTreeEntry,
  FileTreeEntryKind,
  NativeFileTreeEntry,
  VisibleFileTreeRow,
} from "./types";

const EXTENSIONS: Readonly<
  Record<Exclude<FileCategory, "directory" | "unknown">, ReadonlySet<string>>
> = {
  markdown: new Set(["md", "mdx", "markdown"]),
  code: new Set([
    "c",
    "cc",
    "cpp",
    "css",
    "go",
    "h",
    "html",
    "java",
    "js",
    "jsx",
    "kt",
    "lua",
    "php",
    "py",
    "rb",
    "rs",
    "sh",
    "sql",
    "swift",
    "ts",
    "tsx",
    "vue",
  ]),
  config: new Set(["conf", "config", "env", "ini", "lock", "properties", "toml", "yaml", "yml"]),
  data: new Set(["csv", "json", "jsonl", "ndjson", "tsv", "xml"]),
  image: new Set(["avif", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]),
  text: new Set(["log", "rst", "text", "txt"]),
  binary: new Set(["bin", "dmg", "exe", "pdf", "wasm", "zip"]),
};

const CONFIG_NAMES = new Set([
  ".editorconfig",
  ".env",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  "dockerfile",
  "makefile",
  "package.json",
  "tsconfig.json",
]);

const CATEGORY_ALIASES: Readonly<Record<string, FileCategory>> = {
  bin: "binary",
  binary: "binary",
  code: "code",
  config: "config",
  configuration: "config",
  data: "data",
  dir: "directory",
  directory: "directory",
  folder: "directory",
  image: "image",
  img: "image",
  markdown: "markdown",
  md: "markdown",
  source: "code",
  text: "text",
  txt: "text",
  unknown: "unknown",
};

function extension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function categoryFor(name: string, kind: FileTreeEntryKind): FileCategory {
  if (kind === "directory") return "directory";
  const lowered = name.toLowerCase();
  if (CONFIG_NAMES.has(lowered)) return "config";
  const suffix = extension(lowered);
  for (const [category, extensions] of Object.entries(EXTENSIONS) as [
    Exclude<FileCategory, "directory" | "unknown">,
    ReadonlySet<string>,
  ][]) {
    if (extensions.has(suffix)) return category;
  }
  return "unknown";
}

function safeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

function expectedParent(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index < 0 ? null : path.slice(0, index);
}

function kindOrder(kind: FileTreeEntryKind): number {
  return kind === "directory" ? 0 : 1;
}

export function normalizeFileTreeEntries(
  input: readonly NativeFileTreeEntry[],
  gitStates: ReadonlyMap<string, FileGitState> = new Map(),
): readonly FileTreeEntry[] {
  const entries = new Map<string, FileTreeEntry>();
  for (const raw of input) {
    if (!safeRelativePath(raw.relativePath) || entries.has(raw.relativePath)) continue;
    const name = raw.relativePath.split("/").at(-1)!;
    const gitState = gitStates.get(raw.relativePath) ?? (raw.ignored ? "ignored" : null);
    entries.set(raw.relativePath, {
      ...raw,
      name,
      parentPath: expectedParent(raw.relativePath),
      category: categoryFor(name, raw.kind),
      gitState,
    });
  }
  return [...entries.values()].sort((left, right) => {
    const parent = stableTextOrder(left.parentPath ?? "", right.parentPath ?? "");
    if (parent !== 0) return parent;
    const kind = kindOrder(left.kind) - kindOrder(right.kind);
    if (kind !== 0) return kind;
    return stableTextOrder(left.name, right.name);
  });
}

function stableTextOrder(left: string, right: string): number {
  const foldedLeft = left.toLowerCase();
  const foldedRight = right.toLowerCase();
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

interface IndexedTree {
  readonly byPath: ReadonlyMap<string, FileTreeEntry>;
  readonly children: ReadonlyMap<string | null, readonly FileTreeEntry[]>;
}

function indexTree(entries: readonly FileTreeEntry[]): IndexedTree {
  const byPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const children = new Map<string | null, FileTreeEntry[]>();
  for (const entry of entries) {
    const parent =
      entry.parentPath !== null && byPath.has(entry.parentPath) ? entry.parentPath : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(entry);
    children.set(parent, siblings);
  }
  return { byPath, children };
}

interface QueryTerm {
  readonly value: string;
  readonly category: FileCategory | null;
  readonly typedCategory: boolean;
}

function queryTerms(query: string): readonly QueryTerm[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => {
      const typed = /^(?:type|category):(.+)$/u.exec(term);
      const category = CATEGORY_ALIASES[typed?.[1] ?? ""] ?? null;
      return { value: typed ? typed[1]! : term, category, typedCategory: typed !== null };
    });
}

function entryMatches(entry: FileTreeEntry, terms: readonly QueryTerm[]): boolean {
  const name = entry.name.toLowerCase();
  const path = entry.relativePath.toLowerCase();
  return terms.every((term) => {
    if (term.typedCategory) return term.category !== null && entry.category === term.category;
    return (
      name.includes(term.value) || path.includes(term.value) || entry.category.includes(term.value)
    );
  });
}

export function visibleFileTreeRows(
  entries: readonly FileTreeEntry[],
  expandedPaths: ReadonlySet<string>,
  query: string,
): readonly VisibleFileTreeRow[] {
  const tree = indexTree(entries);
  const terms = queryTerms(query);
  const matches = new Set<string>();
  const included = new Set<string>();

  if (terms.length > 0) {
    for (const entry of entries) {
      if (!entryMatches(entry, terms)) continue;
      matches.add(entry.relativePath);
      let current: FileTreeEntry | undefined = entry;
      while (current) {
        included.add(current.relativePath);
        current = current.parentPath ? tree.byPath.get(current.parentPath) : undefined;
      }
    }
  }

  const rows: VisibleFileTreeRow[] = [];
  const visit = (parent: string | null, depth: number): void => {
    const allSiblings = tree.children.get(parent) ?? [];
    const siblings =
      terms.length > 0
        ? allSiblings.filter((entry) => included.has(entry.relativePath))
        : allSiblings;
    siblings.forEach((entry, index) => {
      const children = tree.children.get(entry.relativePath) ?? [];
      const hasChildren = children.length > 0;
      const expanded = hasChildren && (terms.length > 0 || expandedPaths.has(entry.relativePath));
      rows.push({
        entry,
        depth,
        expanded,
        hasChildren,
        matched: matches.has(entry.relativePath),
        positionInSet: index + 1,
        setSize: siblings.length,
      });
      if (expanded) visit(entry.relativePath, depth + 1);
    });
  };
  visit(null, 0);
  return rows;
}

export function maximumRowColumns(rows: readonly VisibleFileTreeRow[]): number {
  return rows.reduce(
    (maximum, row) => Math.max(maximum, row.depth * 2 + row.entry.name.length + 5),
    24,
  );
}
