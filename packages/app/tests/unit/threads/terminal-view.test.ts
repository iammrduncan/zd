import { describe, expect, it, vi } from "vitest";

import { TerminalThreadSession, mountTerminalThreadSurface } from "@/threads";
import type { TerminalAdapter, TerminalSessionHandle } from "@/terminal";

const session: TerminalSessionHandle = {
  sessionId: "session-alpha",
  projectId: "project-alpha",
  worktreeId: "worktree-alpha",
};

function adapter(): TerminalAdapter & { write: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(async () => session),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    read: vi.fn(async () => ({
      session,
      offset: 0,
      droppedBefore: 0,
      bytes: [...new TextEncoder().encode("hello 👩🏽‍💻")],
      readError: null,
    })),
    pollExit: vi.fn(async () => null),
    terminate: vi.fn(async () => ({ reason: "terminated" as const, code: null, signal: null })),
    dispose: vi.fn(async () => undefined),
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("the terminal thread surface", () => {
  it("renders through textContent with accessible output and input focus", async () => {
    const native = adapter();
    const terminal = TerminalThreadSession.attach(native, session);
    const host = document.createElement("div");
    document.body.append(host);
    mountTerminalThreadSurface(host, terminal, {
      threadName: "Review",
      projectName: "Alpha",
      worktreeLabel: "feature/review",
    });

    await terminal.refresh();

    const output = host.querySelector<HTMLElement>('[role="log"]')!;
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(output.textContent).toBe("hello 👩🏽‍💻");
    expect(output.getAttribute("aria-label")).toContain("Review terminal output");
    expect(input.getAttribute("aria-label")).toContain("Review terminal input");
    expect(host.querySelector("script")).toBeNull();
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("sends special keys once and uses the input event for composed text", async () => {
    const native = adapter();
    const terminal = TerminalThreadSession.attach(native, session);
    const host = document.createElement("div");
    document.body.append(host);
    mountTerminalThreadSurface(host, terminal, {
      threadName: "Shell",
      projectName: "Alpha",
      worktreeLabel: "project root",
    });
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    input.value = "日本語";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "日本語" }));
    await settle();
    await vi.waitFor(() => expect(native.write).toHaveBeenCalledTimes(2));

    expect(native.write).toHaveBeenNthCalledWith(1, session, [13]);
    expect(native.write).toHaveBeenNthCalledWith(2, session, [
      ...new TextEncoder().encode("日本語"),
    ]);
    expect(input.value).toBe("");
  });

  it("does not intercept a root-owned application shortcut", async () => {
    const native = adapter();
    const terminal = TerminalThreadSession.attach(native, session);
    const host = document.createElement("div");
    mountTerminalThreadSurface(
      host,
      terminal,
      { threadName: "Shell", projectName: "Alpha", worktreeLabel: "project root" },
      { applicationOwnsKey: (event) => event.metaKey && event.key === "j" },
    );
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));
    await settle();

    expect(native.write).not.toHaveBeenCalled();
  });
});
