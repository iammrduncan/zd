import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const COMPARISON_PATH = /(?:https?:\/\/[^\s`]+)?(\/dev\/(compare-[a-z0-9-]+)\.html)\b/i;

export function comparisonReviewFromHandoff(handoff) {
  const match = COMPARISON_PATH.exec(handoff);
  if (!match) return undefined;

  const basename = match[2].toLowerCase();
  return {
    artifacts: [
      `packages/app/dev/${basename}.html`,
      `packages/app/src/design/${basename}.ts`,
      `packages/app/src/design/${basename}.css`,
      `packages/app/tests/e2e/${basename}.spec.ts`,
    ],
    path: `/dev/${basename}.html`,
  };
}

function signalChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

export function launchComparisonReview(review) {
  if (!review) return { stop() {} };

  const child = spawn("npm", ["run", "dev", "--", "--open", review.path], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();

  return {
    stop() {
      signalChild(child, "SIGTERM");
    },
  };
}

export function removeComparisonArtifacts(review) {
  if (!review) return [];

  const removed = [];
  for (const artifact of review.artifacts) {
    const path = resolve(artifact);
    if (!existsSync(path)) continue;
    unlinkSync(path);
    removed.push(artifact);
  }
  return removed;
}
