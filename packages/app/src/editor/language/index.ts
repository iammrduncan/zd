import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { rust } from "@codemirror/lang-rust";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

import { codeHighlighting } from "./highlight";
import { feedbackLanguage } from "./feedback";
import { todoLanguage } from "./todo";
import { zigLanguage } from "./zig";

export { codeHighlighting } from "./highlight";

export const LANGUAGE_REGISTRY_VERSION = 1 as const;

export interface LanguageRegistration {
  readonly id: string;
  readonly label: string;
  readonly extensions: readonly string[];
  readonly filenames: readonly string[];
  readonly markdown: boolean;
  readonly description: LanguageDescription | null;
}

function code(
  id: string,
  label: string,
  extensions: readonly string[],
  support: LanguageSupport,
  filenames: readonly string[] = [],
): LanguageRegistration {
  return {
    id,
    label,
    extensions,
    filenames,
    markdown: false,
    description: LanguageDescription.of({ name: id, alias: [...extensions], support }),
  };
}

/**
 * The complete bundled language inventory.
 *
 * Filename resolution and fenced-code resolution both derive from this value.
 * Adding support therefore changes this registry and its inventory test, not the
 * shell, file tree, or editor construction path.
 */
export const LANGUAGE_REGISTRY: readonly LanguageRegistration[] = [
  {
    id: "markdown",
    label: "Markdown",
    extensions: ["md", "markdown"],
    filenames: [],
    markdown: true,
    description: null,
  },
  code("rust", "Rust", ["rs"], rust()),
  code("javascript", "JavaScript", ["js", "mjs", "cjs"], javascript()),
  code("jsx", "JSX", ["jsx"], javascript({ jsx: true })),
  code("typescript", "TypeScript", ["ts"], javascript({ typescript: true })),
  code("tsx", "TSX", ["tsx"], javascript({ jsx: true, typescript: true })),
  code("html", "HTML", ["html", "htm"], html()),
  code("css", "CSS", ["css"], css()),
  code("json", "JSON", ["json"], json(), [".eslintrc"]),
  code("zig", "Zig", ["zig"], zigLanguage()),
  code("todo", "Todo", [], todoLanguage(), ["todo.txt"]),
  code("feedback", "Feedback", [], feedbackLanguage(), ["feedback.txt"]),
];

export interface DocumentLanguage {
  readonly id: string;
  readonly label: string;
  readonly markdown: boolean;
  readonly diagram: boolean;
  readonly support: Extension | null;
}

export const MARKDOWN_DOCUMENT: DocumentLanguage = {
  id: "markdown",
  label: "Markdown",
  markdown: true,
  diagram: false,
  support: null,
};

export const MERMAID_DOCUMENT: DocumentLanguage = {
  id: "mermaid",
  label: "Mermaid",
  markdown: false,
  diagram: true,
  support: null,
};

export const PLAIN_TEXT_DOCUMENT: DocumentLanguage = {
  id: "plain-text",
  label: "Plain Text",
  markdown: false,
  diagram: false,
  support: null,
};

export const codeLanguages: readonly LanguageDescription[] = LANGUAGE_REGISTRY.flatMap(
  ({ description }) => (description ? [description] : []),
);

function fileName(path: string): string {
  return (path.split(/[\\/]/).pop() ?? "").toLowerCase();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1);
}

export function languageFor(path: string): DocumentLanguage {
  const name = fileName(path);
  const extension = extensionOf(name);
  if (extension === "mmd" || extension === "mermaid") return MERMAID_DOCUMENT;
  const registration = LANGUAGE_REGISTRY.find(
    (candidate) => candidate.filenames.includes(name) || candidate.extensions.includes(extension),
  );

  if (!registration) return PLAIN_TEXT_DOCUMENT;
  if (registration.markdown) return MARKDOWN_DOCUMENT;

  return {
    id: registration.id,
    label: registration.label,
    markdown: false,
    diagram: false,
    support: registration.description?.support
      ? [registration.description.support, codeHighlighting()]
      : null,
  };
}
