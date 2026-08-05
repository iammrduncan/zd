import { describe, expect, it } from "vitest";

import { describeCodexEvent } from "../../session-codex-stream.mjs";

describe("Codex command stream labels", () => {
  it("describes Git intent instead of exposing the shell lifecycle", () => {
    expect(
      describeCodexEvent({
        type: "item.completed",
        item: {
          command: "/bin/zsh -lc 'git status --short'",
          status: "completed",
          type: "command_execution",
        },
      }),
    ).toEqual({ activity: "GIT | Requested Git status for the repository." });
  });
});
