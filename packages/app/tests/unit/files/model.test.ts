import { describe, expect, it } from "vitest";

import {
  categoryFor,
  fileTreeWindow,
  normalizeFileTreeEntries,
  visibleFileTreeRows,
} from "@/files";
import type { NativeFileTreeEntry } from "@/files";

function entry(relativePath: string, kind: "directory" | "file" = "file"): NativeFileTreeEntry {
  const index = relativePath.lastIndexOf("/");
  return {
    relativePath,
    parentPath: index < 0 ? null : relativePath.slice(0, index),
    name: relativePath.slice(index + 1),
    kind,
    ignored: false,
    byteLength: kind === "file" ? 10 : null,
    modified: 1,
  };
}

describe("file-tree model", () => {
  it("normalizes untrusted metadata and orders directories before files", () => {
    const normalized = normalizeFileTreeEntries([
      entry("z.txt"),
      { ...entry("src", "directory"), name: "wrong", parentPath: "wrong" },
      entry("A.md"),
      entry("../outside.txt"),
      entry("src/main.rs"),
      entry("src/main.rs"),
    ]);

    expect(normalized.map(({ relativePath }) => relativePath)).toEqual([
      "src",
      "A.md",
      "z.txt",
      "src/main.rs",
    ]);
    expect(normalized[0]).toMatchObject({ name: "src", parentPath: null, category: "directory" });
  });

  it("classifies common file types without binding navigation to an editor language", () => {
    expect(categoryFor("README.md", "file")).toBe("markdown");
    expect(categoryFor("main.rs", "file")).toBe("code");
    expect(categoryFor("package.json", "file")).toBe("config");
    expect(categoryFor("records.csv", "file")).toBe("data");
    expect(categoryFor("photo.png", "file")).toBe("image");
    expect(categoryFor("archive.zip", "file")).toBe("binary");
    expect(categoryFor("LICENSE", "file")).toBe("unknown");
  });

  it("shows only expanded descendants and forces matching ancestors without mutating expansion", () => {
    const normalized = normalizeFileTreeEntries([
      entry("docs", "directory"),
      entry("docs/plans", "directory"),
      entry("docs/plans/goal.md"),
      entry("src", "directory"),
      entry("src/main.rs"),
    ]);

    expect(
      visibleFileTreeRows(normalized, new Set(), "").map((row) => row.entry.relativePath),
    ).toEqual(["docs", "src"]);
    expect(
      visibleFileTreeRows(normalized, new Set(["docs"]), "").map((row) => row.entry.relativePath),
    ).toEqual(["docs", "docs/plans", "src"]);
    expect(
      visibleFileTreeRows(normalized, new Set(), "goal").map((row) => row.entry.relativePath),
    ).toEqual(["docs", "docs/plans", "docs/plans/goal.md"]);
  });

  it("filters by path terms and explicit file categories", () => {
    const normalized = normalizeFileTreeEntries([
      entry("docs", "directory"),
      entry("docs/notes.md"),
      entry("src", "directory"),
      entry("src/notes.ts"),
      entry("src/main.rs"),
    ]);

    expect(
      visibleFileTreeRows(normalized, new Set(), "src notes").map((row) => row.entry.relativePath),
    ).toEqual(["src", "src/notes.ts"]);
    expect(
      visibleFileTreeRows(normalized, new Set(), "type:markdown").map(
        (row) => row.entry.relativePath,
      ),
    ).toEqual(["docs", "docs/notes.md"]);
    expect(visibleFileTreeRows(normalized, new Set(), "type:nope")).toEqual([]);
  });

  it("bounds DOM work to the viewport for large logical trees", () => {
    expect(fileTreeWindow(20_000, 9_500, 380)).toEqual({
      start: 494,
      end: 526,
      offset: 9_386,
      totalHeight: 380_000,
    });
    expect(fileTreeWindow(3, -10, 0)).toEqual({
      start: 0,
      end: 3,
      offset: 0,
      totalHeight: 57,
    });
  });
});
