import { describe, expect, it } from "vitest";

import {
  EDITOR_BUFFER_SCHEMA_VERSION,
  editorBufferFromRead,
  type BoundedFileRead,
} from "@/editor/buffer";

function read(result: BoundedFileRead) {
  return editorBufferFromRead("src/main.ts", result);
}

describe("bounded editor buffers", () => {
  it("turns writable UTF-8 text into an editable versioned buffer", () => {
    const buffer = read({
      status: "text",
      text: "const ready = true;",
      byteLength: 19,
      writable: true,
    });

    expect(buffer).toMatchObject({
      schemaVersion: EDITOR_BUFFER_SCHEMA_VERSION,
      identity: "live:src/main.ts",
      kind: "editable",
      path: "src/main.ts",
      content: "const ready = true;",
      byteLength: 19,
      editable: true,
      reason: null,
    });
    expect(buffer.language.id).toBe("typescript");
  });

  it("keeps a native revision identity separate from its display path", () => {
    const buffer = editorBufferFromRead(
      "src/main.ts",
      {
        status: "text",
        text: "const old = true;",
        byteLength: 17,
        writable: false,
      },
      "git-buffer-revision",
    );

    expect(buffer).toMatchObject({
      identity: "git-buffer-revision",
      path: "src/main.ts",
      kind: "read-only",
    });
  });

  it("keeps readable text inspectable when the platform says it is read-only", () => {
    const buffer = read({
      status: "text",
      text: "const fixed = true;",
      byteLength: 19,
      writable: false,
      reason: "This revision belongs to commit 4fb1a2.",
    });

    expect(buffer).toMatchObject({
      kind: "read-only",
      content: "const fixed = true;",
      editable: false,
      reason: "This revision belongs to commit 4fb1a2. Editing is unavailable.",
    });
  });

  it.each([
    ["binary", "Binary file", 42],
    ["undecodable", "valid UTF-8", 43],
    ["missing", "no longer exists", null],
    ["denied", "Permission denied", null],
  ] as const)(
    "states a %s result without inventing editable text",
    (status, reason, byteLength) => {
      const result =
        byteLength === null
          ? ({ status } as BoundedFileRead)
          : ({ status, byteLength } as BoundedFileRead);
      const buffer = read(result);

      expect(buffer.kind).toBe(status);
      expect(buffer.content).toBeNull();
      expect(buffer.editable).toBe(false);
      expect(buffer.reason).toContain(reason);
    },
  );

  it("shows only the native bounded preview for an over-limit text file", () => {
    const buffer = read({
      status: "over-limit",
      byteLength: 9 * 1024 * 1024,
      limit: 8 * 1024 * 1024,
      preview: "first safe UTF-8 page",
    });

    expect(buffer).toMatchObject({
      kind: "over-limit",
      content: "first safe UTF-8 page",
      editable: false,
      byteLength: 9 * 1024 * 1024,
    });
    expect(buffer.reason).toContain("8 MiB editing limit");
    expect(buffer.reason).toContain("bounded preview");
  });

  it("states an unavailable platform result without interpreting it as an encoding", () => {
    const buffer = read({ status: "unavailable", problem: "The project grant is unavailable." });

    expect(buffer).toMatchObject({
      kind: "unavailable",
      content: null,
      editable: false,
      reason: "The project grant is unavailable. Editing is unavailable.",
    });
  });
});
