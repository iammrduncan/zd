#!/usr/bin/env node

import console from "node:console";
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const TODO_PATH = resolve("docs/_internal/objectives/todo.txt");
const ARCHIVE_PATH = resolve("docs/_internal/objectives/todo-archive.txt");
const ARCHIVE_HEADER = `# zd md — completed tasks, moved out of docs/_internal/objectives/todo.txt by /archive
# Same format as the task list. Newest block last. Nothing here is edited or deleted.
`;

function fail(message) {
  throw new Error(message);
}

function isCheckpoint(line) {
  return /^(?:\([ABC]\) \d{4}-\d{2}-\d{2} )?CHECKPOINT\b/.test(line);
}

function isOpenTask(line) {
  return /^\([ABC]\) /.test(line) && !isCheckpoint(line);
}

function isBlocked(line) {
  const blockVerdicts = line.match(/\b(?:BLOCKED|UNBLOCKED)\b/g) ?? [];
  return blockVerdicts.at(-1) === "BLOCKED";
}

function taskCount(count) {
  return `${count} open ${count === 1 ? "task" : "tasks"}`;
}

function tasksRemaining(count) {
  return `${taskCount(count)} ${count === 1 ? "remains" : "remain"}`;
}

function collapseLargeBlankRuns(lines) {
  const collapsed = [];

  for (let index = 0; index < lines.length;) {
    if (lines[index].trim() !== "") {
      collapsed.push(lines[index]);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < lines.length && lines[end].trim() === "") end += 1;
    const run = lines.slice(index, end);
    collapsed.push(...(run.length >= 3 ? run.slice(0, 1) : run));
    index = end;
  }

  return collapsed;
}

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function replaceFile(path, contents) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o644;

  try {
    writeFileSync(temporaryPath, contents, { mode });
    renameSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function appendArchive(existingArchive, completedLines) {
  const base = existingArchive.endsWith("\n") ? existingArchive : `${existingArchive}\n`;
  return `${base}\n## ${localDate()}\n\n${completedLines.join("\n")}\n`;
}

function nextWork(lines) {
  const significant = lines.filter(
    (line) => line.trim() !== "" && !line.startsWith("#") && !line.startsWith("x "),
  );
  const checkpointIndex = significant.findIndex(isCheckpoint);
  const band = checkpointIndex === -1 ? significant : significant.slice(0, checkpointIndex);
  const active = band.find((line) => !isBlocked(line));
  const next = active ?? (checkpointIndex === -1 ? undefined : significant[checkpointIndex]);
  const phaseSource = band.find((line) => /\+p\d+\b/.test(line)) ?? next;
  const phase = phaseSource?.match(/\+p\d+\b/)?.[0] ?? "unknown phase";
  return { next: next ?? "no open task", phase };
}

function archiveCompletedTasks() {
  if (!existsSync(TODO_PATH)) {
    fail(
      "docs/_internal/objectives/todo.txt does not exist; run this command from the repository root",
    );
  }

  const todoBefore = readFileSync(TODO_PATH, "utf8");
  const linesBefore = todoBefore.split("\n");
  const completed = linesBefore.filter((line) => line.startsWith("x "));
  const openTaskCount = linesBefore.filter(isOpenTask).length;
  console.log(`Found ${completed.length} completed tasks; ${taskCount(openTaskCount)}.`);

  if (completed.length === 0) {
    console.log(`Moved 0 completed tasks; ${tasksRemaining(openTaskCount)}.`);
    const live = nextWork(linesBefore);
    console.log(`Live: ${live.phase}; next: ${live.next}`);
    return;
  }

  const remainingVerbatim = linesBefore.filter((line) => !line.startsWith("x "));
  const openCheckpointsBefore = linesBefore.filter(
    (line) => !line.startsWith("x ") && isCheckpoint(line),
  );
  const openCheckpointsAfter = remainingVerbatim.filter(isCheckpoint);
  if (openCheckpointsAfter.join("\n") !== openCheckpointsBefore.join("\n")) {
    fail("Open checkpoints changed during archive planning; refusing to write");
  }

  const remaining = collapseLargeBlankRuns(remainingVerbatim);
  const todoAfter = remaining.join("\n");
  const archiveBefore = existsSync(ARCHIVE_PATH)
    ? readFileSync(ARCHIVE_PATH, "utf8")
    : ARCHIVE_HEADER;
  const archiveAfter = appendArchive(archiveBefore, completed);

  // Preserve completed work before removing it from the live task list. A failure
  // between these writes can duplicate lines, but it cannot lose them.
  replaceFile(ARCHIVE_PATH, archiveAfter);
  replaceFile(TODO_PATH, todoAfter);

  const todoWritten = readFileSync(TODO_PATH, "utf8");
  const archiveWritten = readFileSync(ARCHIVE_PATH, "utf8");
  const linesWritten = todoWritten.split("\n");
  const remainingCompleted = linesWritten.filter((line) => line.startsWith("x "));
  const openTaskCountAfter = linesWritten.filter(isOpenTask).length;
  const openCheckpointsWritten = linesWritten.filter(isCheckpoint);
  const writeIsValid =
    todoWritten === todoAfter &&
    archiveWritten === archiveAfter &&
    remainingCompleted.length === 0 &&
    openTaskCountAfter === openTaskCount &&
    openCheckpointsWritten.join("\n") === openCheckpointsBefore.join("\n");
  if (!writeIsValid) {
    fail("Post-write archive verification failed; inspect both task files before continuing");
  }

  const live = nextWork(remaining);
  console.log(`Moved ${completed.length} completed tasks; ${tasksRemaining(openTaskCount)}.`);
  console.log(`Live: ${live.phase}; next: ${live.next}`);
}

function main() {
  try {
    if (process.argv.includes("--help")) {
      console.log(
        "Usage: npm run zdarchive\n\nMove every ^x line from docs/_internal/objectives/todo.txt to docs/_internal/objectives/todo-archive.txt.",
      );
      return;
    }
    if (process.argv.length > 2) fail("zdarchive accepts no arguments");
    archiveCompletedTasks();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`archive-tasks: ${message}`);
    process.exitCode = 1;
  }
}

main();
