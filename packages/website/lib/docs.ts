import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

import MarkdownIt from "markdown-it";

function findRepositoryRoot(start: string): string {
  let candidate = resolve(start);

  while (candidate !== dirname(candidate)) {
    if (existsSync(resolve(candidate, "docs", "user-facing-docs"))) return candidate;
    candidate = dirname(candidate);
  }

  throw new Error("Could not find the zd repository root");
}

const REPOSITORY_ROOT = findRepositoryRoot(process.cwd());
const DOCS_ROOT = resolve(REPOSITORY_ROOT, "docs", "user-facing-docs");
const REPOSITORY_URL = "https://github.com/iammrduncan/zd/blob/main";
const EXCLUDED_FILES = new Set(["AGENTS.md", "CLAUDE.md", "DOCUMENTATION_STANDARDS_A.md"]);
const DOC_ALIASES = new Map([
  ["explanation/markdown-reading-surface", "tutorials/read-and-review-markdown"],
]);
const SECTION_ORDER = new Map([
  ["tutorials", 0],
  ["how-to", 1],
  ["reference", 2],
  ["explanation", 3],
]);

export type PublicDoc = {
  description: string;
  href: string;
  html: string;
  section: string;
  slug: string[];
  title: string;
};

function markdownFiles(directory = DOCS_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) return markdownFiles(absolutePath);
    if (!entry.isFile() || !entry.name.endsWith(".md") || EXCLUDED_FILES.has(entry.name)) {
      return [];
    }

    return [posix.normalize(absolutePath.slice(DOCS_ROOT.length + 1))];
  });
}

function slugFor(relativePath: string): string[] {
  if (relativePath === "README.md") return [];
  return relativePath.replace(/\.md$/, "").split("/");
}

function hrefFor(slug: string[]): string {
  return slug.length === 0 ? "/docs/" : `/docs/${slug.join("/")}/`;
}

function titleFor(markdown: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Untitled";
}

function descriptionFor(markdown: string): string {
  const withoutTitle = markdown.replace(/^#\s+.+\n+/, "");
  const paragraph =
    withoutTitle
      .split(/\n\s*\n/)
      .find((block) => !/^(?:#{1,6}\s|```|[-*]\s|\|)/.test(block.trim())) ?? "";
  const plainText = paragraph
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= 160) return plainText;
  const shortened = plainText.slice(0, 157);
  const lastWord = shortened.lastIndexOf(" ");
  const endpoint = lastWord > 0 ? lastWord : shortened.length;
  return `${shortened.slice(0, endpoint).trimEnd()}…`;
}

function rewriteTarget(target: string, relativePath: string): string {
  if (/^(?:[a-z]+:|#)/i.test(target)) return target;

  const [path, hash = ""] = target.split("#", 2);
  if (!path) return target;

  const sourceDirectory = dirname(relativePath);
  const resolvedPath = posix.normalize(posix.join(sourceDirectory, path));
  const suffix = hash ? `#${hash}` : "";

  if (resolvedPath.endsWith(".md") && !resolvedPath.startsWith("..")) {
    return `${hrefFor(slugFor(resolvedPath))}${suffix}`;
  }

  const repositoryPath = posix.normalize(posix.join("docs/user-facing-docs", resolvedPath));
  return `${REPOSITORY_URL}/${repositoryPath}${suffix}`;
}

function rewriteLinks(markdown: string, relativePath: string): string {
  return markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (_match, open, target, close) => {
    return `${open}${rewriteTarget(target, relativePath)}${close}`;
  });
}

function sectionFor(slug: string[]): string {
  if (slug.length === 0) return "Overview";

  const segment = slug[0]!;
  return segment === "how-to" ? "How-to guides" : segment[0]!.toUpperCase() + segment.slice(1);
}

export function getPublicDocs(): PublicDoc[] {
  const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });

  return markdownFiles()
    .map((relativePath) => {
      const source = readFileSync(resolve(DOCS_ROOT, relativePath), "utf8");
      const slug = slugFor(relativePath);

      return {
        description: descriptionFor(source),
        href: hrefFor(slug),
        html: markdown.render(rewriteLinks(source, relativePath)),
        section: sectionFor(slug),
        slug,
        title: titleFor(source),
      };
    })
    .sort((left, right) => {
      if (left.slug.length === 0) return -1;
      if (right.slug.length === 0) return 1;

      const leftOrder = SECTION_ORDER.get(left.slug[0]!) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = SECTION_ORDER.get(right.slug[0]!) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.title.localeCompare(right.title);
    });
}

export function getPublicDoc(slug: string[]): PublicDoc | undefined {
  const requested = slug.join("/");
  const canonical = DOC_ALIASES.get(requested) ?? requested;
  return getPublicDocs().find((doc) => doc.slug.join("/") === canonical);
}

export function getPublicDocStaticSlugs(): string[][] {
  const canonical = getPublicDocs()
    .filter((doc) => doc.slug.length > 0)
    .map((doc) => doc.slug);
  const aliases = [...DOC_ALIASES.keys()].map((slug) => slug.split("/"));
  return [...canonical, ...aliases];
}
