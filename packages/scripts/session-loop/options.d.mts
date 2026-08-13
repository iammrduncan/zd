import type { Readable, Writable } from "node:stream";

export interface CodexRunOptions {
  fastMode: boolean;
  model?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export function promptCodexOptions(streams: {
  input: Readable;
  output: Writable;
}): Promise<CodexRunOptions>;

export function shouldPromptForCodexOptions(options: { dryRun: boolean }): boolean;
