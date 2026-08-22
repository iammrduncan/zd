import { describe, expect, it } from "vitest";

import {
  DEFAULT_TERMINAL_SCROLLBACK_ROWS,
  TerminalScrollback,
  createTerminalStartRequest,
  terminalSessionKey,
  terminalViewport,
  type TerminalSessionHandle,
} from "@/terminal";

const handle: TerminalSessionHandle = {
  sessionId: "session-0000000000000001",
  projectId: "project-a",
  worktreeId: "worktree-a",
};

describe("the structured terminal boundary", () => {
  it("starts only inside an approved project/worktree identity", () => {
    const request = createTerminalStartRequest(
      { projectId: "project-a", worktreeId: "worktree-a" },
      { rows: 24, columns: 80, pixelWidth: 640, pixelHeight: 384 },
    );

    expect(request).toEqual({
      projectId: "project-a",
      worktreeId: "worktree-a",
      viewport: { rows: 24, columns: 80, pixelWidth: 640, pixelHeight: 384 },
    });
    expect(request).not.toHaveProperty("cwd");
    expect(request).not.toHaveProperty("command");
    expect(request).not.toHaveProperty("environment");
  });

  it("uses every stable identity when addressing a session", () => {
    expect(terminalSessionKey(handle)).toBe("project-a\0worktree-a\0session-0000000000000001");
  });

  it("rejects dimensions that cannot describe a real bounded viewport", () => {
    expect(() => terminalViewport({ rows: 0, columns: 80 })).toThrow("rows");
    expect(() => terminalViewport({ rows: 24, columns: 0 })).toThrow("columns");
    expect(() => terminalViewport({ rows: 24.5, columns: 80 })).toThrow("rows");
    expect(() => terminalViewport({ rows: 24, columns: 80, pixelWidth: -1 })).toThrow("pixelWidth");
  });
});

describe("bounded terminal scrollback", () => {
  it("has a finite default", () => {
    expect(DEFAULT_TERMINAL_SCROLLBACK_ROWS).toBeGreaterThan(0);
    expect(DEFAULT_TERMINAL_SCROLLBACK_ROWS).toBeLessThanOrEqual(100_000);
  });

  it("retains only the newest complete rows and reports what was released", () => {
    const scrollback = new TerminalScrollback(3);

    scrollback.append(["one", "two"]);
    scrollback.append(["three", "four"]);

    expect(scrollback.snapshot()).toEqual({
      rows: ["two", "three", "four"],
      discardedRows: 1,
    });
  });

  it("keeps Unicode and grapheme clusters intact by evicting whole rows", () => {
    const scrollback = new TerminalScrollback(2);

    scrollback.append(["older", "👩🏽‍💻 café", "日本語"]);

    expect(scrollback.snapshot()).toEqual({
      rows: ["👩🏽‍💻 café", "日本語"],
      discardedRows: 1,
    });
  });

  it("does not expose its mutable backing rows", () => {
    const scrollback = new TerminalScrollback(2);
    scrollback.append(["one"]);

    const snapshot = scrollback.snapshot();
    snapshot.rows.push("outside");

    expect(scrollback.snapshot().rows).toEqual(["one"]);
  });

  it("rejects an unbounded or nonsensical capacity", () => {
    expect(() => new TerminalScrollback(0)).toThrow("scrollback");
    expect(() => new TerminalScrollback(Number.POSITIVE_INFINITY)).toThrow("scrollback");
    expect(() => new TerminalScrollback(100_001)).toThrow("scrollback");
  });
});
