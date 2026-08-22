import { describe, expect, it } from "vitest";

import {
  prepareDiagnosticRecord,
  redactLogicalPath,
  type DiagnosticRecordInput,
} from "@/instrumentation";

function prepared(input: DiagnosticRecordInput) {
  const result = prepareDiagnosticRecord(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.problem);
  return result.value;
}

describe("diagnostic record schema", () => {
  it("accepts the four bounded evidence shapes feature owners need", () => {
    expect(
      prepared({
        recordType: "event",
        operation: "workbench.launch",
        outcome: "ok",
      }),
    ).toEqual({ recordType: "event", operation: "workbench.launch", outcome: "ok" });

    expect(
      prepared({
        recordType: "span",
        operation: "file.open",
        traceId: "trace-0001",
        spanId: "span-0001",
        durationUs: 125_000,
        outcome: "ok",
      }),
    ).toMatchObject({ recordType: "span", durationUs: 125_000 });

    expect(
      prepared({
        recordType: "error",
        operation: "git.status",
        code: "permission-denied",
      }),
    ).toMatchObject({ recordType: "error", code: "permission-denied" });

    expect(
      prepared({
        recordType: "state",
        operation: "thread.transition",
        from: "busy",
        to: "waiting",
      }),
    ).toMatchObject({ recordType: "state", from: "busy", to: "waiting" });
  });

  it("keeps stable opaque context IDs and replaces paths with structural metadata", () => {
    const record = prepared({
      recordType: "event",
      operation: "file.save",
      outcome: "ok",
      context: {
        projectId: "project-0001",
        worktreeId: "worktree-0001",
        threadId: "thread-0001",
        threadSessionId: "session-0001",
        logicalPath: "/Users/alice/private/acquisition-plan.md",
      },
    });

    expect(record.context).toEqual({
      projectId: "project-0001",
      worktreeId: "worktree-0001",
      threadId: "thread-0001",
      threadSessionId: "session-0001",
      logicalPath: { scope: "redacted", depth: 4, extension: "md" },
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("alice");
    expect(serialized).not.toContain("acquisition-plan");
  });

  it("describes project-relative paths without retaining names or traversal", () => {
    expect(redactLogicalPath("src/instrumentation/session.ts")).toEqual({
      scope: "project",
      depth: 3,
      extension: "ts",
    });
    expect(redactLogicalPath("../secrets/.env")).toEqual({
      scope: "redacted",
      depth: 2,
    });
    expect(redactLogicalPath("C:\\Users\\alice\\notes.txt")).toEqual({
      scope: "redacted",
      depth: 4,
      extension: "txt",
    });
  });

  it("rejects unknown fields so content and environment dumps cannot hitch a ride", () => {
    for (const input of [
      {
        recordType: "event",
        operation: "terminal.write",
        outcome: "ok",
        transcript: "private terminal output",
      },
      {
        recordType: "error",
        operation: "terminal.spawn",
        code: "failed",
        message: "/Users/alice/project failed with TOKEN=secret",
      },
      {
        recordType: "event",
        operation: "editor.input",
        outcome: "ok",
        contents: "document body",
      },
    ]) {
      expect(prepareDiagnosticRecord(input)).toEqual({
        ok: false,
        problem: expect.stringContaining("additional key"),
      });
    }
  });

  it("rejects unsafe tokens, unbounded numbers, and malformed contexts", () => {
    expect(
      prepareDiagnosticRecord({
        recordType: "event",
        operation: "prompt: super secret text",
        outcome: "ok",
      }),
    ).toMatchObject({ ok: false });
    expect(
      prepareDiagnosticRecord({
        recordType: "span",
        operation: "file.open",
        traceId: "trace-1",
        spanId: "span-1",
        durationUs: Number.POSITIVE_INFINITY,
        outcome: "ok",
      }),
    ).toMatchObject({ ok: false });
    expect(
      prepareDiagnosticRecord({
        recordType: "event",
        operation: "file.open",
        outcome: "ok",
        context: { projectId: "/Users/alice/project" },
      }),
    ).toMatchObject({ ok: false });
  });
});
