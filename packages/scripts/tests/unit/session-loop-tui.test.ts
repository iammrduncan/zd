import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

const RUNNER = resolve(process.cwd(), "packages/scripts/session-loop.mjs");
const fixtures: string[] = [];

function makeFixture({
  codexBody = `for (let index = 0; index < 50; index += 1) {
  const command = "raw-log-" + String(index).padStart(2, "0");
  const event = { type: "item.started", item: { type: "command_execution", command } };
  process.stdout.write(JSON.stringify(event) + "\\n");
}
setInterval(() => {}, 1_000);`,
  todo = "(A) 2026-08-03 Long task +p4 @reset est:30m vis:12\nCHECKPOINT - stop\n",
} = {}): string {
  const root = mkdtempSync(join(tmpdir(), "zd-session-loop-tui-"));
  fixtures.push(root);
  mkdirSync(join(root, "docs", "_internal/objectives"), { recursive: true });
  writeFileSync(join(root, "docs", "_internal/objectives", "todo.txt"), todo);
  writeFileSync(join(root, "docs/_internal/objectives/FEEDBACK.md"), "# Feedback\n\n---\n");
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync(
    "git",
    ["add", "docs/_internal/objectives/todo.txt", "docs/_internal/objectives/FEEDBACK.md"],
    {
      cwd: root,
    },
  );
  spawnSync(
    "git",
    [
      "-c",
      "user.name=Session Loop Test",
      "-c",
      "user.email=session-loop@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: root },
  );

  const bin = join(root, "bin");
  mkdirSync(bin);
  const codex = join(bin, "codex");
  writeFileSync(codex, `#!/usr/bin/env node\n${codexBody}\n`);
  chmodSync(codex, 0o755);
  return root;
}

function currentScreen(output: string): string {
  return output.split("\u001b[2J\u001b[H").at(-1) ?? output;
}

function startTui(root: string) {
  const child = spawn(process.execPath, [RUNNER, "1s"], {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      PATH: `${join(root, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      ZDLOOP_TUI: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let answeredPrompts = 0;
  const promptEndings = ["Codex model: ", "blank keeps config default): ", "[y/N]: "];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const expectedPrompt = promptEndings[answeredPrompts];
    if (expectedPrompt && stdout.endsWith(expectedPrompt)) {
      child.stdin.write("\n");
      answeredPrompts += 1;
    }
  });
  const completed = new Promise<void>((resolvePromise) => child.on("close", resolvePromise));
  return { child, completed, stdout: () => stdout };
}

async function waitFor(check: () => boolean, description: string) {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("the zdloop TUI", () => {
  it("mouse-scrolls back through the agent stream", async () => {
    const root = makeFixture();
    const tui = startTui(root);

    try {
      await waitFor(() => tui.stdout().includes("Agent stream (summary)"), "the agent stream");
      tui.child.stdin.write("l");
      await waitFor(
        () =>
          currentScreen(tui.stdout()).includes("Agent log (raw)") &&
          currentScreen(tui.stdout()).includes("raw-log-49"),
        "the raw agent stream",
      );
      expect(currentScreen(tui.stdout())).not.toContain("raw-log-00");

      tui.child.stdin.write("\u001b[<64;1;1M".repeat(50));

      await waitFor(
        () => currentScreen(tui.stdout()).includes("raw-log-00"),
        "the oldest agent event",
      );
    } finally {
      if (tui.child.exitCode === null) tui.child.stdin.write("x");
      await tui.completed;
    }
  });

  it("mouse-scrolls down and back to the top of a long recap", async () => {
    const root = makeFixture({
      codexBody: `const lines = Array.from({ length: 50 }, (_, index) => "recap-line-" + String(index).padStart(2, "0"));
const event = { type: "item.completed", item: { type: "agent_message", text: lines.join("\\n") } };
process.stdout.write(JSON.stringify(event) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: {} }) + "\\n");`,
      todo: "CHECKPOINT - stop\n",
    });
    const tui = startTui(root);

    try {
      await waitFor(
        () =>
          currentScreen(tui.stdout()).includes("Summary ready") &&
          currentScreen(tui.stdout()).includes("recap-line-00"),
        "the top of the recap",
      );

      tui.child.stdin.write("\u001b[<65;1;1M".repeat(50));
      await waitFor(
        () => currentScreen(tui.stdout()).includes("recap-line-49"),
        "the bottom of the recap",
      );

      tui.child.stdin.write("\u001b[<64;1;1M".repeat(50));
      await waitFor(
        () => currentScreen(tui.stdout()).includes("recap-line-00"),
        "the top of the recap again",
      );
    } finally {
      if (tui.child.exitCode === null) tui.child.stdin.write("q");
      await tui.completed;
    }
  });
});
