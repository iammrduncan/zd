import { describe, expect, it } from "vitest";

import { LANGUAGE_REGISTRY, LANGUAGE_REGISTRY_VERSION, languageFor } from "@/editor/language";

/*
 * Which files are markdown — vision §6.2, and the feedback "html and ts parsed as
 * markdown" (2026-07-29).
 *
 * A pure function of a path, so it is measured as one. What needs a browser is
 * whether the surface then *acts* on the answer, and that is in
 * tests/e2e/editor/code.spec.ts.
 *
 * The `markdown` flag is what every assertion here is really about: it gates the
 * heading decorations, the link rendering, the table widget, Enter continuation,
 * and Tab indentation all at once. Getting it wrong for a `.ts` file is not a
 * missing nicety — it is markdown rewriting someone's source on screen.
 */

describe("markdown files", () => {
  it("recognises the two markdown extensions", () => {
    expect(languageFor("notes.md").markdown).toBe(true);
    expect(languageFor("notes.markdown").markdown).toBe(true);
  });

  it("ignores case and directories", () => {
    expect(languageFor("/Users/someone/Docs/README.MD").markdown).toBe(true);
    expect(languageFor("C:\\work\\NOTES.Markdown").markdown).toBe(true);
  });

  it("leaves markdown's own parser to the notation extension", () => {
    // Null on purpose, not an oversight: `markdownNotation()` installs the parser
    // together with the decorations that depend on it, and a second place holding
    // half of that pair is how the two drift.
    expect(languageFor("notes.md").support).toBeNull();
  });
});

describe("mermaid files", () => {
  it("recognises both standalone Mermaid extensions", () => {
    for (const path of ["architecture.mmd", "docs/flow.mermaid", "FLOW.MMD"]) {
      const language = languageFor(path);
      expect(language.id).toBe("mermaid");
      expect(language.label).toBe("Mermaid");
      expect(language.markdown).toBe(false);
      expect(language.diagram).toBe(true);
    }
  });
});

describe("files that are not markdown", () => {
  it("does not treat source files as markdown", () => {
    // The reported pair, by name.
    expect(languageFor("index.html").markdown).toBe(false);
    expect(languageFor("editor.ts").markdown).toBe(false);
  });

  it("does not treat a file with no extension as markdown", () => {
    /*
     * `LICENSE` and `Makefile` are not CommonMark. The safe direction for a file
     * we cannot identify is to do *less* to it — defaulting the unknown case to
     * markdown is the reported bug with a wider blast radius.
     */
    expect(languageFor("LICENSE").markdown).toBe(false);
    expect(languageFor("/repo/Makefile").markdown).toBe(false);
  });

  it("treats a dotfile as a name rather than an extension", () => {
    // `.gitignore` has no extension — it *is* its name. Reading "gitignore" as a
    // type would be inventing one.
    expect(languageFor(".gitignore").markdown).toBe(false);
    expect(languageFor(".gitignore").support).toBeNull();
  });

  it("does not mistake a dotted directory for a file type", () => {
    expect(languageFor("/repo/some.dir/notes.md").markdown).toBe(true);
    expect(languageFor("/repo/v1.2/LICENSE").markdown).toBe(false);
  });
});

describe("the shared highlighting inventory", () => {
  it("is one versioned inventory for file and fenced-code resolution", () => {
    expect(LANGUAGE_REGISTRY_VERSION).toBe(1);
    expect(LANGUAGE_REGISTRY.map(({ id }) => id)).toEqual([
      "markdown",
      "rust",
      "javascript",
      "jsx",
      "typescript",
      "tsx",
      "html",
      "css",
      "json",
      "zig",
      "todo",
      "feedback",
    ]);
  });

  it("gives a Rust file the grammar a Rust fence already gets", () => {
    expect(languageFor("main.rs").support).not.toBeNull();
    expect(languageFor("main.rs").markdown).toBe(false);
  });

  it("supports the approved JavaScript, TypeScript, and HTML families", () => {
    for (const path of [
      "editor.js",
      "component.jsx",
      "editor.ts",
      "component.tsx",
      "index.html",
      "archive.htm",
    ]) {
      expect(languageFor(path).support, `${path} stayed plain`).not.toBeNull();
    }
  });

  it("supports CSS and JSON because both occur in this repository", () => {
    for (const path of ["styles.css", "package.json"]) {
      expect(languageFor(path).support, `${path} stayed plain`).not.toBeNull();
    }
  });

  it("gives Zig source its own syntax grammar", () => {
    const language = languageFor("src/main.zig");

    expect(language.id).toBe("zig");
    expect(language.label).toBe("Zig");
    expect(language.support).not.toBeNull();
  });

  it("recognises todo.txt without treating every text file as a task list", () => {
    const todo = languageFor("notes/todo.txt");

    expect(todo.id).toBe("todo");
    expect(todo.support).not.toBeNull();
    expect(languageFor("notes.txt").support).toBeNull();
  });

  it("recognises FEEDBACK.txt as a section-aware document", () => {
    const feedback = languageFor("docs/planning/FEEDBACK.txt");

    expect(feedback.id).toBe("feedback");
    expect(feedback.support).not.toBeNull();
    expect(feedback.supportsClipboardImages).toBe(true);
  });

  it("leaves every language outside the inventory as honest monospace", () => {
    for (const path of ["data.yaml", "config.toml", "run.py", "notes.txt"]) {
      expect(languageFor(path).support, `${path} received a grammar`).toBeNull();
    }
  });
});
