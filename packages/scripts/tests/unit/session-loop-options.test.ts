import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { promptCodexOptions } from "../../session-loop-options.mjs";

async function answerPrompts(answers: string[]) {
  const input = new PassThrough();
  const output = new PassThrough();
  let transcript = "";
  let answerIndex = 0;

  output.setEncoding("utf8");
  output.on("data", (chunk) => {
    transcript += chunk;
    if (answerIndex < answers.length && transcript.endsWith(": ")) {
      input.write(`${answers[answerIndex]}\n`);
      answerIndex += 1;
    }
  });

  const options = await promptCodexOptions({ input, output });
  input.end();
  output.end();
  return { options, transcript };
}

describe("zdloop Codex startup choices", () => {
  it("collects model, reasoning effort, and Fast mode for the whole run", async () => {
    const result = await answerPrompts(["gpt-5.6-terra", "medium", "y"]);

    expect(result.options).toEqual({
      fastMode: true,
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
    });
    expect(result.transcript).toContain("Codex settings for this zdloop run");
    expect(result.transcript).toContain("Fast mode uses more credits");
  });

  it("keeps config defaults when the model and effort are blank", async () => {
    const result = await answerPrompts(["", "", ""]);

    expect(result.options).toEqual({ fastMode: false });
  });

  it("asks again when effort or Fast mode is not recognized", async () => {
    const result = await answerPrompts(["gpt-5.6-sol", "ultra", "high", "maybe", "no"]);

    expect(result.options).toEqual({
      fastMode: false,
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    expect(result.transcript).toContain("Choose minimal, low, medium, high, or xhigh.");
    expect(result.transcript).toContain("Answer yes or no.");
  });
});
