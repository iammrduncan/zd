import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function wrapText(text, width, shorten) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word.length <= width ? word : shorten(word, width);
  }
  if (line) lines.push(line);
  return lines;
}

function wrapLines(text, width, shorten) {
  return text.split("\n").flatMap((line) => (line.trim() ? wrapText(line, width, shorten) : [""]));
}

function hasTaskTag(task, tag) {
  return task.split(/\s+/).includes(tag);
}

export function readLatestComparisonHandoff(
  memoryPath = resolve("docs/_internal/objectives/session-memory.log"),
) {
  if (!existsSync(memoryPath)) return "";

  const entries = readFileSync(memoryPath, "utf8").split(/\n(?=## \d{4}-\d{2}-\d{2}T)/);
  for (const entry of entries.reverse()) {
    const task = /^Task: (.+)$/m.exec(entry)?.[1];
    if (!task || !hasTaskTag(task, "@COMPARE")) continue;

    const handoff = /\nStatus: [^\n]+(?:\nSignal: [^\n]+)?\n\n([\s\S]*)$/.exec(entry)?.[1];
    return handoff?.trim() ?? "";
  }
  return "";
}

export function renderDecision(
  { answer, color, guide, notice, scroll, shorten, task },
  width,
  height,
) {
  const taskWidth = Math.max(20, width - 4);
  const taskLines = wrapText(task, taskWidth, shorten);
  const guideLines = guide
    ? wrapLines(guide, taskWidth, shorten)
    : [color("No saved @COMPARE handoff was found.", "33")];
  const reviewLines = [
    color("Comparison handoff", "1;36"),
    ...guideLines,
    "",
    color("Decision", "1;36"),
    ...taskLines,
  ];
  const noticeLines = notice ? 2 : 0;
  const availableReviewLines = Math.max(4, height - 9 - noticeLines);
  const maxScroll = Math.max(0, reviewLines.length - availableReviewLines);
  const boundedScroll = Math.min(Math.max(0, scroll), maxScroll);
  const visibleReviewLines = reviewLines.slice(boundedScroll, boundedScroll + availableReviewLines);
  const answerWidth = Math.max(10, taskWidth - 2);
  const visibleAnswer =
    answer.length <= answerWidth ? answer : `…${answer.slice(-(answerWidth - 1))}`;
  const lines = [
    `${color("zdloop", "1;36")}  ${color("Decision required", "1;33")}`,
    color("─".repeat(Math.min(width, 100)), "36"),
    "Review the saved @COMPARE handoff, then answer the decision below.",
    "",
    ...visibleReviewLines,
    color(
      `Review lines ${boundedScroll + 1}-${Math.min(reviewLines.length, boundedScroll + availableReviewLines)} of ${reviewLines.length} • mouse scroll`,
      "2",
    ),
    "",
    `${color(">", "1;36")} ${visibleAnswer}${color("▌", "36")}`,
  ];
  if (notice) lines.push("", color(notice, "33"));
  lines.push("", color("[Enter] submit   [Backspace] edit   [Ctrl+C] quit", "2"));
  return { lines, scroll: boundedScroll };
}
