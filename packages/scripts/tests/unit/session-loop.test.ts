/* eslint-disable max-lines -- integration scenarios stay together around one CLI fixture */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

const RUNNER = resolve(process.cwd(), "packages/scripts/session-loop.mjs");
const PROMPT =
  "Use $zd-session to run the next open task. Run exactly one session and stop after its handoff; the outer runner will decide whether another session is allowed.";

function recapPrompt(startCommit: string, checkpoint: string): string {
  return `This is the final read-only recap for a completed zdloop run. The run started at git commit ${startCommit} and stopped at "${checkpoint}". Review committed changes in ${startCommit}..HEAD and the matching recent work-session handoffs in docs/_objectives/session-memory.log. Do not change files. Tell the user what changed, give a prioritized manual test checklist, say what feedback to provide for each item, and call out known failures, deferred work, or blocked tasks. Ignore changes that predate the starting commit and treat unrelated uncommitted worktree changes as pre-existing.`;
}

const fixtures: string[] = [];

function makeFixture(todo: string, feedback = "# Feedback\n\n---\n"): string {
  const root = mkdtempSync(join(tmpdir(), "zd-session-loop-"));
  fixtures.push(root);
  mkdirSync(join(root, "docs", "_objectives"), { recursive: true });
  writeFileSync(join(root, "docs", "_objectives", "todo.txt"), todo);
  writeFileSync(join(root, "docs/_objectives/FEEDBACK.md"), feedback);
  spawnSync("git", ["init", "-q"], { cwd: root });
  spawnSync("git", ["add", "docs/_objectives/todo.txt", "docs/_objectives/FEEDBACK.md"], {
    cwd: root,
  });
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
  return root;
}

function headCommit(root: string): string {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
}

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function installFakeCodex(root: string, body: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const executable = join(bin, "codex");
  writeFileSync(executable, `#!/usr/bin/env node\n${body}`);
  chmodSync(executable, 0o755);
  return bin;
}

function installFakeNpm(root: string): void {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const executable = join(bin, "npm");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
appendFileSync(join(root, "comparison-launch.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
process.on("SIGTERM", () => {
  appendFileSync(join(root, "comparison-stopped"), "SIGTERM\\n");
  process.exit(0);
});
setInterval(() => {}, 1_000);
`,
  );
  chmodSync(executable, 0o755);
}

async function waitFor(check: () => boolean, description: string, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function startTui(root: string, bin: string, wait = "20ms", codexAnswers = ["", "", ""]) {
  const child = spawn(process.execPath, [RUNNER, wait], {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      ZDLOOP_TUI: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let answeredPrompts = 0;
  const promptEndings = ["Codex model: ", "blank keeps config default): ", "[y/N]: "];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const expectedPrompt = promptEndings[answeredPrompts];
    if (expectedPrompt && stdout.endsWith(expectedPrompt)) {
      child.stdin.write(`${codexAnswers[answeredPrompts] ?? ""}\n`);
      answeredPrompts += 1;
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completed = new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolvePromise, reject) => {
      child.on("error", reject);
      child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
    },
  );
  return { child, completed, stderr: () => stderr, stdout: () => stdout };
}

function currentScreen(output: string): string {
  return output.split("\u001b[2J\u001b[H").at(-1) ?? output;
}

function stripAnsi(output: string): string {
  const escape = String.fromCharCode(27);
  return output.replace(new RegExp(`${escape}\\[[0-9;?]*[A-Za-z]`, "g"), "");
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("the Codex session loop dry run", () => {
  it("lists every open task before the next checkpoint and the prompt for each run", () => {
    const root = makeFixture(`# plan
x 2026-07-30 (A) 2026-07-29 Already done +p2 @editor est:10m

(A) 2026-07-30 First open task +p2 @editor est:20m
(B) 2026-07-30 A task about CHECKPOINT handling +p2 @editor est:20m
CHECKPOINT - stop and test
(A) 2026-07-30 Past the stop +p3 @shell est:20m
`);

    const result = run(root, "1m", "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^Dry run summary:\n {2}Tasks to work: 2\n {2}Blocked tasks: 0\n {2}Comparison tasks: 0\n {2}Decision gates: 0\n {2}Pending feedback: 0 \(0 urgent\)\n {2}Codex sessions before checkpoint: 2\n {2}Wait between sessions: 1m \(60000ms\)\n {2}Stop: CHECKPOINT - stop and test/,
    );
    expect(result.stdout).toContain("1. (A) 2026-07-30 First open task");
    expect(result.stdout).toContain("2. (B) 2026-07-30 A task about CHECKPOINT handling");
    expect(result.stdout).not.toContain("Past the stop");
    expect(result.stdout).toContain("Stop: CHECKPOINT - stop and test");
    expect(
      result.stdout.match(new RegExp(`Prompt: ${PROMPT.replace("$", "\\$")}`, "g")),
    ).toHaveLength(2);
    expect(result.stdout).toContain("Final recap: 1 read-only Codex session after checkpoint");
    expect(result.stdout).toContain(
      `Prompt: ${recapPrompt(headCommit(root), "CHECKPOINT - stop and test")}`,
    );
    expect(existsSync(join(root, "docs", "_objectives", "session-memory.log"))).toBe(false);
  });

  it("reports zero runs when the checkpoint is already next", () => {
    const root = makeFixture(`# plan
x 2026-07-30 (A) 2026-07-29 Already done +p2 @editor est:10m
CHECKPOINT - stop here
(A) 2026-07-30 Past the stop +p3 @shell est:20m
`);

    const result = run(root, "60s", "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^Dry run summary:\n {2}Tasks to work: 0\n {2}Blocked tasks: 0\n {2}Comparison tasks: 0\n {2}Decision gates: 0\n {2}Pending feedback: 0 \(0 urgent\)\n {2}Codex sessions before checkpoint: 0\n {2}Wait between sessions: 60s \(60000ms\)\n {2}Stop: CHECKPOINT - stop here/,
    );
  });

  it("forces a session when feedback is pending even if the checkpoint is next", () => {
    const root = makeFixture(
      `CHECKPOINT - stop here
(A) 2026-07-30 Past the stop +p3 @shell est:20m
`,
      `# Feedback

---
! Fix the focus jump
Polish the startup copy
`,
    );

    const result = run(root, "60s", "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^Dry run summary:\n {2}Tasks to work: 0\n {2}Blocked tasks: 0\n {2}Comparison tasks: 0\n {2}Decision gates: 0\n {2}Pending feedback: 2 \(1 urgent\)\n {2}Minimum Codex sessions before checkpoint: 1 \(recalculated after triage\)\n {2}Wait between sessions: 60s \(60000ms\)\n {2}Stop: CHECKPOINT - stop here/,
    );
    expect(result.stdout).toContain("Feedback forces the next Codex session");
    expect(result.stdout).toContain(`Prompt: ${PROMPT}`);
  });

  it("does not schedule tasks that carry a written block", () => {
    const root = makeFixture(`# plan
(A) 2026-07-30 Waiting for an API +p2 @shell est:20m BLOCKED until phase 3
(B) 2026-07-30 Work that can run +p2 @editor est:20m
CHECKPOINT - stop here
`);

    const result = run(root, "60s", "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^Dry run summary:\n {2}Tasks to work: 1\n {2}Blocked tasks: 1\n {2}Comparison tasks: 0\n {2}Decision gates: 0\n {2}Pending feedback: 0 \(0 urgent\)\n {2}Codex sessions before checkpoint: 1\n {2}Wait between sessions: 60s \(60000ms\)\n {2}Stop: CHECKPOINT - stop here/,
    );
    expect(result.stdout).toContain("1. (B) 2026-07-30 Work that can run");
    expect(result.stdout).not.toContain("1. (A) 2026-07-30 Waiting for an API");
    expect(result.stdout).toContain("Blocked in this band: 1");
    expect(result.stdout).toContain("Waiting for an API");
  });

  it("counts tagged review gates and ignores control words in prose", () => {
    const root = makeFixture(`# plan
(B) 2026-08-03 Explain why DECIDE can appear in prose +p2 @design est:20m
(B) 2026-08-03 Render two options side by side +p2 @design @COMPARE est:20m
(B) 2026-08-03 Choose whether option one or option two wins +p2 @design @DECIDE est:20m
CHECKPOINT - stop here
`);

    const result = run(root, "60s", "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("  Comparison tasks: 1");
    expect(result.stdout).toContain("  Decision gates: 1");
    expect(result.stdout).toContain(
      "3. (B) 2026-08-03 Choose whether option one or option two wins",
    );
    expect(result.stdout).toContain("Review artifact required before its following @DECIDE gate.");
    expect(
      result.stdout.match(/Human input required in the TUI before this session\./g),
    ).toHaveLength(1);
  });

  it("runs an answered decision without asking for human input again", () => {
    const task =
      "(B) 2026-08-03 Choose whether highlighting stays Rust-only or expands +p2 @design @DECIDE est:20m ANSWERED 2026-08-03 expand highlighting";
    const root = makeFixture(`${task}\nCHECKPOINT - stop here\n`);

    const result = run(root, "60s", "--dry-run");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("  Decision gates: 0");
    expect(result.stdout).toContain(`1. ${task}`);
    expect(result.stdout).toContain(`   Prompt: ${PROMPT}`);
    expect(result.stdout).not.toContain("Human input required in the TUI before this session.");
  });

  it("refuses to run a plan with no future checkpoint", () => {
    const root = makeFixture(`(A) 2026-07-30 Work forever +p2 @editor est:20m\n`);

    const result = run(root, "60s", "--dry-run");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "No open checkpoint remains in docs/_objectives/todo.txt; refusing to loop",
    );
  });

  it("rejects an invalid wait duration", () => {
    const root = makeFixture(`CHECKPOINT - stop\n`);

    const result = run(root, "soon", "--dry-run");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Wait must be a positive duration such as 60s, 5m, or 250ms");
  });

  it("rejects a zero-length gap", () => {
    const root = makeFixture(`CHECKPOINT - stop\n`);

    const result = run(root, "0s", "--dry-run");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Wait must be a positive duration such as 60s, 5m, or 250ms");
  });
});

describe("the Codex session loop", () => {
  it("pauses at @DECIDE, accepts an answer in the TUI, and passes it to Codex", async () => {
    const comparisonTask =
      "(B) 2026-08-03 Compare Rust-only and expanded highlighting +p2 @design @COMPARE est:20m";
    const task =
      "(B) 2026-08-03 Choose whether highlighting stays Rust-only or expands +p2 @design @DECIDE est:20m";
    const root = makeFixture(
      `x 2026-08-03 ${comparisonTask}\n${task}\nCHECKPOINT - inspect the result\n`,
    );
    const reviewLines = Array.from(
      { length: 30 },
      (_, index) => `comparison-detail-${String(index).padStart(2, "0")}`,
    );
    writeFileSync(
      join(root, "docs", "_objectives", "session-memory.log"),
      `# Codex session memory\n\n## 2026-08-03T16:50:37.904Z\n\nTask: ${comparisonTask}\n\nPrompt: session\n\nStatus: success\n\n${reviewLines.join("\n")}\nRun npm run dev -- --open /dev/compare-highlighting.html and inspect both panels.\n`,
    );
    const comparisonFiles = [
      "packages/app/dev/compare-highlighting.html",
      "packages/app/src/design/compare-highlighting.ts",
      "packages/app/src/design/compare-highlighting.css",
      "packages/app/tests/e2e/compare-highlighting.spec.ts",
    ];
    for (const path of comparisonFiles) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "comparison artifact\n");
    }
    const bin = installFakeCodex(
      root,
      `import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const prompt = process.argv.at(-1);
const comparisonFiles = ${JSON.stringify(comparisonFiles)};
appendFileSync(join(root, "invocations.jsonl"), JSON.stringify({
  prompt,
  comparisonArtifactsPresent: comparisonFiles.some((path) => existsSync(join(root, path))),
}) + "\\n");
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
if (prompt.includes("final read-only recap")) {
  emit({ type: "item.completed", item: { type: "agent_message", text: "Decision implemented." } });
  emit({ type: "turn.completed", usage: {} });
  process.exit(0);
}
const todoPath = join(root, "docs", "_objectives", "todo.txt");
const todo = readFileSync(todoPath, "utf8").split("\\n");
const decisionIndex = todo.findIndex((line) => line.split(/\\s+/).includes("@DECIDE"));
todo[decisionIndex] = "x 2026-08-03 " + todo[decisionIndex];
writeFileSync(todoPath, todo.join("\\n"));
emit({ type: "item.completed", item: { type: "agent_message", text: "Expanded highlighting." } });
emit({ type: "turn.completed", usage: {} });
`,
    );
    installFakeNpm(root);
    const tui = startTui(root, bin);
    const invocationPath = join(root, "invocations.jsonl");
    const launchPath = join(root, "comparison-launch.jsonl");

    await waitFor(
      () => currentScreen(tui.stdout()).includes("Decision required") && existsSync(launchPath),
      "the launched comparison and decision prompt",
    );
    expect(JSON.parse(readFileSync(launchPath, "utf8").trim())).toEqual([
      "run",
      "dev",
      "--",
      "--open",
      "/dev/compare-highlighting.html",
    ]);
    expect(stripAnsi(currentScreen(tui.stdout()))).toContain(
      "Model config default • Thinking config default • Fast mode disabled",
    );
    expect(stripAnsi(currentScreen(tui.stdout()))).toContain("comparison-detail-00");
    expect(stripAnsi(currentScreen(tui.stdout()))).not.toContain(
      "npm run dev -- --open /dev/compare-highlighting.html",
    );
    tui.child.stdin.write("\u001b[<65;1;1M".repeat(20));
    await waitFor(
      () =>
        stripAnsi(currentScreen(tui.stdout())).includes(
          "npm run dev -- --open /dev/compare-highlighting.html",
        ),
      "the comparison command on the decision screen",
    );
    expect(existsSync(invocationPath)).toBe(false);
    tui.child.stdin.write("expandedd\u007f\n");

    await waitFor(
      () =>
        existsSync(invocationPath) &&
        readFileSync(invocationPath, "utf8").trim().split("\n").length === 2,
      "the decision session and recap",
    );
    await waitFor(() => currentScreen(tui.stdout()).includes("Summary ready"), "the final recap");
    expect(stripAnsi(currentScreen(tui.stdout()))).toContain(
      "Model config default • Thinking config default • Fast mode disabled",
    );
    tui.child.stdin.write("q");
    const result = await tui.completed;

    expect(result.status, result.stderr).toBe(0);
    const invocations = readFileSync(invocationPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { comparisonArtifactsPresent: boolean; prompt: string });
    expect(invocations[0]!.prompt).toContain(task);
    expect(invocations[0]!.prompt).toContain("User decision: expanded");
    expect(invocations[0]!.prompt).toContain(
      "Removed the completed comparison artifact before this session",
    );
    expect(invocations[0]!.comparisonArtifactsPresent).toBe(false);
    expect(comparisonFiles.every((path) => !existsSync(join(root, path)))).toBe(true);
    await waitFor(
      () => existsSync(join(root, "comparison-stopped")),
      "the comparison dev server to stop",
    );
    expect(readFileSync(join(root, "docs", "_objectives", "todo.txt"), "utf8")).toContain(
      `x 2026-08-03 ${task}`,
    );
  });

  it("stops cleanly at @DECIDE without a TUI instead of invoking Codex", () => {
    const task = "(B) 2026-08-03 Choose one or two +p2 @design @DECIDE est:20m";
    const root = makeFixture(`${task}\nCHECKPOINT - stop\n`);
    const bin = installFakeCodex(
      root,
      `import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.cwd(), "invoked"), "yes");
`,
    );

    const result = spawnSync(process.execPath, [RUNNER, "1ms", "--no-tui"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Decision required: ${task}`);
    expect(result.stdout).toContain("Run zdloop interactively to answer it.");
    expect(existsSync(join(root, "invoked"))).toBe(false);
  });

  it("gracefully stops after the active session, shows its recap, and continues on command", async () => {
    const root = makeFixture(`(A) 2026-07-30 First task +p2 @editor est:20m
(B) 2026-07-30 Second task +p2 @editor est:20m
CHECKPOINT - inspect the result
`);
    const bin = installFakeCodex(
      root,
      `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const prompt = process.argv.at(-1);
appendFileSync(join(root, "invocations.jsonl"), JSON.stringify({ args: process.argv.slice(2), prompt }) + "\\n");
const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
if (prompt.includes("final read-only recap")) {
  emit({ type: "item.completed", item: { id: "summary", type: "agent_message", text: "# Testing summary\\n\\n- Check the completed task." } });
  emit({ type: "turn.completed", usage: {} });
  process.exit(0);
}
emit({ type: "item.started", item: { id: "command", type: "command_execution", command: "npm test", status: "in_progress" } });
setTimeout(() => {
  const todoPath = join(root, "docs", "_objectives", "todo.txt");
  const lines = readFileSync(todoPath, "utf8").split("\\n");
  const index = lines.findIndex((line) => /^\\([ABC]\\) /.test(line));
  lines[index] = "x 2026-07-31 " + lines[index];
  writeFileSync(todoPath, lines.join("\\n"));
  emit({ type: "item.completed", item: { id: "command", type: "command_execution", command: "npm test", status: "completed" } });
  emit({ type: "item.completed", item: { id: "message", type: "agent_message", text: "# Work handoff\\n\\n- **Completed** one task." } });
  emit({ type: "turn.completed", usage: {} });
}, 120);
`,
    );
    const tui = startTui(root, bin, "20ms", ["gpt-5.6-terra", "medium", "yes"]);
    const invocationPath = join(root, "invocations.jsonl");

    await waitFor(
      () =>
        existsSync(invocationPath) &&
        readFileSync(invocationPath, "utf8").trim().split("\n").length === 1,
      "the first work session",
    );
    await waitFor(() => tui.stdout().includes("RUN TESTS"), "the summarized command event");
    expect(stripAnsi(currentScreen(tui.stdout()))).toContain(
      "Model gpt-5.6-terra • Thinking medium • Fast mode enabled",
    );
    tui.child.stdin.write("L");
    await waitFor(
      () => currentScreen(tui.stdout()).includes("Agent log (raw)"),
      "the raw Codex log view",
    );
    expect(currentScreen(tui.stdout())).toContain('{"type":"item.started"');
    expect(currentScreen(tui.stdout())).not.toContain("RUN TESTS");
    tui.child.stdin.write("l");
    await waitFor(
      () => currentScreen(tui.stdout()).includes("Agent stream (summary)"),
      "the summarized Codex view",
    );
    tui.child.stdin.write("s");
    await waitFor(() => tui.stdout().includes("Summary ready"), "the graceful-stop summary");
    expect(stripAnsi(currentScreen(tui.stdout()))).toContain(
      "Model gpt-5.6-terra • Thinking medium • Fast mode enabled",
    );

    let todo = readFileSync(join(root, "docs", "_objectives", "todo.txt"), "utf8");
    expect(todo).toContain("x 2026-07-31 (A) 2026-07-30 First task");
    expect(todo).toContain("(B) 2026-07-30 Second task");

    const summariesBeforeContinue = (tui.stdout().match(/Summary ready/g) ?? []).length;
    let quitSent = false;
    const quitAtCheckpoint = () => {
      const summaryCount = (tui.stdout().match(/Summary ready/g) ?? []).length;
      if (quitSent || summaryCount <= summariesBeforeContinue) return;
      quitSent = true;
      tui.child.stdin.write("q");
    };
    tui.child.stdout.on("data", quitAtCheckpoint);
    tui.child.stdin.write("c");

    await waitFor(
      () => readFileSync(invocationPath, "utf8").trim().split("\n").length === 4,
      "the continued task and second recap",
    );
    await waitFor(() => quitSent, "the checkpoint summary prompt");
    await waitFor(
      () => tui.child.exitCode !== null,
      `the TUI process to exit; screen=${JSON.stringify(stripAnsi(currentScreen(tui.stdout())))} stderr=${JSON.stringify(tui.stderr())}`,
    );
    const result = await tui.completed;
    tui.child.stdout.off("data", quitAtCheckpoint);

    expect(quitSent).toBe(true);
    expect(result.status, result.stderr).toBe(0);
    const screen = stripAnsi(result.stdout);
    expect(screen).toContain("zdloop");
    expect(screen).toContain("Todos");
    expect(screen).toContain("Feedback");
    expect(screen).toContain("Todo queue");
    expect(screen).toContain("Recently done");
    expect(screen).toContain("Feedback sent");
    expect(screen).toContain("Agent stream");
    expect(screen).toContain("RUN TESTS | Ran the relevant test suite.");
    expect(result.stdout).toContain("\u001b[1;36mWork handoff\u001b[0m");
    expect(result.stdout).toContain("\u001b[1mCompleted\u001b[0m");
    expect(screen).toContain("Graceful stop requested");
    expect(screen).toContain("[c] continue");
    expect(result.stdout).toContain("\u001b[1;36mTesting summary\u001b[0m");
    const memory = readFileSync(join(root, "docs", "_objectives", "session-memory.log"), "utf8");
    expect(memory).toContain("# Testing summary\n\n- Check the completed task.");
    expect(memory).not.toContain("\u001b[");
    todo = readFileSync(join(root, "docs", "_objectives", "todo.txt"), "utf8");
    expect(todo).toContain("x 2026-07-31 (B) 2026-07-30 Second task");

    const invocations = readFileSync(invocationPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[]; prompt: string });
    expect(invocations.filter(({ prompt }) => prompt === PROMPT)).toHaveLength(2);
    expect(
      invocations.filter(({ prompt }) => prompt.includes("final read-only recap")),
    ).toHaveLength(2);
    for (const invocation of invocations) {
      expect(invocation.args).toContain("--json");
      expect(invocation.args).toContain("gpt-5.6-terra");
      expect(invocation.args).toContain('model_reasoning_effort="medium"');
      expect(invocation.args).toContain('service_tier="fast"');
      expect(invocation.args).toContain("features.fast_mode=true");
    }
  }, 10_000);

  it("kills the active Codex process immediately without running a recap", async () => {
    const root = makeFixture(`(A) 2026-07-30 Long task +p2 @editor est:20m
CHECKPOINT - inspect the result
`);
    const bin = installFakeCodex(
      root,
      `import { appendFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
process.on("SIGTERM", () => {
  appendFileSync(join(root, "killed"), "SIGTERM\\n");
  process.exit(143);
});
appendFileSync(join(root, "invocations.jsonl"), JSON.stringify({ args: process.argv.slice(2), prompt: process.argv.at(-1) }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.started", item: { id: "command", type: "command_execution", command: "long-running test", status: "in_progress" } }) + "\\n");
setTimeout(() => process.exit(1), 1500);
`,
    );
    const startedAt = Date.now();
    const tui = startTui(root, bin);
    const invocationPath = join(root, "invocations.jsonl");
    await waitFor(() => existsSync(invocationPath), "the long-running Codex session");
    tui.child.stdin.write("x");
    const result = await tui.completed;

    expect(result.status).toBe(130);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(readFileSync(join(root, "killed"), "utf8")).toContain("SIGTERM");
    expect(readFileSync(invocationPath, "utf8")).not.toContain("final read-only recap");
    expect(readFileSync(join(root, "docs", "_objectives", "todo.txt"), "utf8")).toContain(
      "(A) 2026-07-30 Long task",
    );
  });

  it("runs a final read-only recap even when the checkpoint is already next", () => {
    const root = makeFixture(`CHECKPOINT - inspect the result\n`);
    const bin = installFakeCodex(
      root,
      `import { appendFileSync } from "node:fs";
import { join } from "node:path";
appendFileSync(join(process.cwd(), "invocations.jsonl"), JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write("# Loop recap\\n\\n- **Test:** run \`npm test\`.\\n");
`,
    );

    const result = spawnSync(process.execPath, [RUNNER, "1ms"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        FORCE_COLOR: "1",
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const invocation = JSON.parse(
      readFileSync(join(root, "invocations.jsonl"), "utf8").trim(),
    ) as string[];
    expect(invocation).toEqual([
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-c",
      'approval_policy="never"',
      "--color",
      "never",
      recapPrompt(headCommit(root), "CHECKPOINT - inspect the result"),
    ]);
    expect(result.stdout).toContain("Starting final read-only Codex recap");
    expect(result.stdout).toContain("\u001b[1;36mLoop recap\u001b[0m");
    expect(result.stdout).toContain("\u001b[36m•\u001b[0m");
    expect(result.stdout).toContain("\u001b[38;5;220mnpm test\u001b[0m");
    expect(result.stdout).not.toContain("# Loop recap");
    const memory = readFileSync(join(root, "docs", "_objectives", "session-memory.log"), "utf8");
    expect(memory).toContain("Task: Final loop recap");
    expect(memory).toContain("# Loop recap\n\n- **Test:** run `npm test`.");
    expect(memory).not.toContain("\u001b[");
  });

  it("runs a feedback session at the checkpoint and exits after triaged work is completed", () => {
    const root = makeFixture(
      `CHECKPOINT - inspect the feedback work
(A) 2026-07-30 Past the stop +p3 @shell est:20m
`,
      `# Feedback

---
! Fix the focus jump
`,
    );
    const bin = installFakeCodex(
      root,
      `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const todoPath = join(root, "docs", "_objectives", "todo.txt");
const todo = readFileSync(todoPath, "utf8");
const prompt = process.argv.at(-1);
appendFileSync(join(root, "invocations"), prompt.includes("final read-only recap") ? "recap\\n" : "work\\n");
if (prompt.includes("final read-only recap")) {
  process.stdout.write("Test the completed focus fix.\\n");
  process.exit(0);
}
writeFileSync(join(root, "docs/_objectives/FEEDBACK.md"), "# Feedback\\n\\n---\\n");
writeFileSync(todoPath, "x 2026-07-31 (A) 2026-07-31 Fix the focus jump +p1 @editor +fb fb:2026-07-31 est:20m\\n" + todo);
process.stdout.write("Triaged feedback and completed: Fix the focus jump\\n");
`,
    );

    const result = spawnSync(process.execPath, [RUNNER, "1ms"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(root, "invocations"), "utf8")).toBe("work\nrecap\n");
    expect(result.stdout).toContain("Checkpoint reached after 1 Codex session");
    expect(readFileSync(join(root, "docs", "_objectives", "session-memory.log"), "utf8")).toContain(
      "Triaged feedback and completed: Fix the focus jump",
    );
  });

  it("accepts an emptied feedback inbox as progress when no task lands above the checkpoint", () => {
    const root = makeFixture(
      `CHECKPOINT - inspect the result
(A) 2026-07-30 Past the stop +p3 @shell est:20m
`,
      `# Feedback

---
Record this as a note for a later phase
`,
    );
    const bin = installFakeCodex(
      root,
      `import { writeFileSync } from "node:fs";
import { join } from "node:path";
if (process.argv.at(-1).includes("final read-only recap")) {
  process.stdout.write("Nothing landed above the checkpoint.\\n");
  process.exit(0);
}
writeFileSync(join(process.cwd(), "docs/_objectives/FEEDBACK.md"), "# Feedback\\n\\n---\\n");
process.stdout.write("Triaged feedback; no task belongs above this checkpoint.\\n");
`,
    );

    const result = spawnSync(process.execPath, [RUNNER, "1ms"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Checkpoint reached after 1 Codex session");
    expect(result.stderr).not.toContain("did not change");
  });

  it("runs one Codex process per task, logs final messages, waits, and stops at the checkpoint", () => {
    const root = makeFixture(`(A) 2026-07-30 First task +p2 @editor est:20m
(B) 2026-07-30 Second task +p2 @editor est:20m
CHECKPOINT - inspect the result
(A) 2026-07-30 Past the stop +p3 @shell est:20m
`);
    const bin = installFakeCodex(
      root,
      `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const todoPath = join(root, "docs", "_objectives", "todo.txt");
const lines = readFileSync(todoPath, "utf8").split("\\n");
const prompt = process.argv.at(-1);
appendFileSync(join(root, "invocations.jsonl"), JSON.stringify({ args: process.argv.slice(2), at: Date.now() }) + "\\n");
if (prompt.includes("final read-only recap")) {
  process.stdout.write("Final testing brief: verify both completed tasks.\\n");
  process.exit(0);
}
const index = lines.findIndex((line) => /^\\([ABC]\\) /.test(line));
const task = lines[index];
lines[index] = "x 2026-07-31 " + task;
writeFileSync(todoPath, lines.join("\\n"));
process.stdout.write("Completed: " + task + "\\n");
`,
    );

    const result = spawnSync(process.execPath, [RUNNER, "50ms"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Checkpoint reached after 2 Codex sessions");

    const invocations = readFileSync(join(root, "invocations.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { args: string[]; at: number });
    expect(invocations).toHaveLength(3);
    for (const invocation of invocations.slice(0, 2)) {
      expect(invocation.args).toEqual([
        "exec",
        "--ephemeral",
        "--sandbox",
        "workspace-write",
        "--color",
        "never",
        PROMPT,
      ]);
    }
    expect(invocations[1]!.at - invocations[0]!.at).toBeGreaterThanOrEqual(40);
    expect(invocations[2]!.args).toEqual([
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-c",
      'approval_policy="never"',
      "--color",
      "never",
      recapPrompt(headCommit(root), "CHECKPOINT - inspect the result"),
    ]);

    const memory = readFileSync(join(root, "docs", "_objectives", "session-memory.log"), "utf8");
    expect(memory).toContain("# Codex session memory");
    expect(memory.match(/^## /gm)).toHaveLength(3);
    expect(memory.match(/Status: success/g)).toHaveLength(3);
    expect(memory).toContain("Completed: (A) 2026-07-30 First task");
    expect(memory).toContain("Completed: (B) 2026-07-30 Second task");
    expect(memory).toContain("Task: Final loop recap");
    expect(memory).toContain("Final testing brief: verify both completed tasks.");

    const todo = readFileSync(join(root, "docs", "_objectives", "todo.txt"), "utf8");
    expect(todo).toContain("x 2026-07-31 (A) 2026-07-30 First task");
    expect(todo).toContain("x 2026-07-31 (B) 2026-07-30 Second task");
    expect(todo).toContain("(A) 2026-07-30 Past the stop");
  });

  it("stops after one run when Codex makes no task-list progress", () => {
    const root = makeFixture(`(A) 2026-07-30 Stuck task +p2 @editor est:20m
CHECKPOINT - stop
`);
    const bin = installFakeCodex(
      root,
      `import { appendFileSync } from "node:fs";
import { join } from "node:path";
appendFileSync(join(process.cwd(), "invocations"), "called\\n");
process.stdout.write("I could not complete the task.\\n");
`,
    );

    const result = spawnSync(process.execPath, [RUNNER, "1ms"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "docs/_objectives/todo.txt did not change; stopping to avoid repeating the same task",
    );
    expect(readFileSync(join(root, "invocations"), "utf8").trim().split("\n")).toHaveLength(1);
    expect(readFileSync(join(root, "docs", "_objectives", "session-memory.log"), "utf8")).toContain(
      "I could not complete the task.",
    );
  });
});
