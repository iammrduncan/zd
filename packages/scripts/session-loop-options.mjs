import { createInterface } from "node:readline/promises";
import process from "node:process";

const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);

async function askReasoningEffort(readline, output) {
  while (true) {
    const answer = (
      await readline.question(
        "Reasoning effort (minimal/low/medium/high/xhigh; blank keeps config default): ",
      )
    )
      .trim()
      .toLowerCase();
    if (answer === "" || REASONING_EFFORTS.has(answer)) return answer || undefined;
    output.write("Choose minimal, low, medium, high, or xhigh.\n");
  }
}

async function askFastMode(readline, output) {
  while (true) {
    const answer = (await readline.question("Enable Fast mode? [y/N]: ")).trim().toLowerCase();
    if (answer === "" || answer === "n" || answer === "no") return false;
    if (answer === "y" || answer === "yes") return true;
    output.write("Answer yes or no.\n");
  }
}

export async function promptCodexOptions({ input, output }) {
  const readline = createInterface({ input, output });
  try {
    output.write("Codex settings for this zdloop run (blank answers keep project defaults).\n");
    const model = (await readline.question("Codex model: ")).trim() || undefined;
    const reasoningEffort = await askReasoningEffort(readline, output);
    output.write("Fast mode uses more credits on supported models.\n");
    const fastMode = await askFastMode(readline, output);

    return {
      fastMode,
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    };
  } finally {
    readline.close();
  }
}

export function shouldPromptForCodexOptions(options) {
  if (options.dryRun) return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) || process.env.ZDLOOP_TUI === "1";
}
