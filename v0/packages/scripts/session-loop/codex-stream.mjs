import { spawn } from "node:child_process";
import process from "node:process";

import { shorten } from "./tui.mjs";

function unwrapShellCommand(command) {
  const shellCommand = String(command ?? "").trim();
  const loginCommand = shellCommand.indexOf(" -lc ");
  if (loginCommand === -1) return shellCommand;

  const body = shellCommand.slice(loginCommand + 5).trim();
  const quote = body[0];
  if ((quote === "'" || quote === '"') && body.at(-1) === quote) return body.slice(1, -1);
  return body;
}

function commandActivity(command) {
  const body = unwrapShellCommand(command);
  const gitStatus = /\bgit(?:\s+-C\s+(?:"([^"]+)"|'([^']+)'|(\S+)))?\s+status\b/.exec(body);
  if (gitStatus) {
    const location = gitStatus[1] ?? gitStatus[2] ?? gitStatus[3];
    return location
      ? `GIT | Requested Git status for ${location}.`
      : "GIT | Requested Git status for the repository.";
  }
  if (/\bgit\s+(?:diff|show|log)\b/.test(body)) {
    return "GIT | Inspected Git changes and history.";
  }
  if (/\bgit\s+add\b/.test(body)) return "GIT | Staged repository changes.";
  if (/\bgit\s+commit\b/.test(body)) return "GIT | Created a repository commit.";
  if (/\b(?:npm\s+(?:run\s+)?test|npx\s+(?:vitest|playwright)|cargo\s+test)\b/.test(body)) {
    return "RUN TESTS | Ran the relevant test suite.";
  }
  if (/\brg\b/.test(body)) return "SEARCH CODE | Searched the repository for relevant code.";
  if (/\b(?:sed|head|tail|cat)\b/.test(body)) {
    return "READ FILES | Inspected relevant repository files.";
  }
  if (/\b(?:find|ls)\b/.test(body)) {
    return "LIST FILES | Inspected the repository structure.";
  }
  return "RUN COMMAND | Ran a repository command.";
}

export function describeCodexEvent(event) {
  if (event.type === "error") {
    return { activity: `HANDLE ERROR | Codex reports ${event.message ?? "an unknown failure"}.` };
  }
  if (event.type === "turn.failed") {
    return {
      activity: `TURN FAILED | The Codex turn failed with ${event.error?.message ?? "an unknown error"}.`,
    };
  }

  const item = event.item;
  if (!item) {
    const label = String(event.type ?? "Codex event").replaceAll(".", " ");
    return { activity: `TRACK CODEX | Codex reports its ${label} state.` };
  }
  if (item.type === "agent_message") {
    return {
      finalMessage: item.text ?? "",
      markdown: item.text ?? "",
    };
  }
  if (item.type === "command_execution") {
    return { activity: commandActivity(item.command) };
  }
  if (item.type === "reasoning") {
    const reasoning = item.text ?? item.summary?.[0]?.text ?? item.summary ?? "Reasoning";
    return { activity: `PLAN WORK | The agent reasons about ${shorten(String(reasoning), 80)}.` };
  }
  if (item.type === "file_change") {
    const paths = (item.changes ?? []).map((change) => change.path).filter(Boolean);
    return {
      activity: `EDIT FILES | The agent changes ${paths.join(", ") || "files in the working tree"}.`,
    };
  }
  if (item.type === "mcp_tool_call") {
    return {
      activity: `CALL TOOL | The agent calls ${item.server ?? "MCP"}/${item.tool ?? item.name ?? "a tool"}.`,
    };
  }
  if (item.type === "web_search") {
    return { activity: `SEARCH WEB | The agent searches for ${item.query ?? "information"}.` };
  }
  if (item.type === "todo_list") {
    return { activity: "UPDATE PLAN | The agent updates its working plan." };
  }
  return { activity: `PROCESS EVENT | The agent processes a ${item.type ?? "Codex"} event.` };
}

function consumeJsonLines(chunk, stream, onLine) {
  stream.buffer += chunk;
  const lines = stream.buffer.split("\n");
  stream.buffer = lines.pop() ?? "";
  for (const line of lines) onLine(line);
}

export function runCodex(prompt, { approvalPolicy, codexOptions = {}, control, sandbox, tui }) {
  const args = ["exec", "--ephemeral", "--sandbox", sandbox];
  if (approvalPolicy) args.push("-c", `approval_policy="${approvalPolicy}"`);
  if (codexOptions.model) args.push("--model", codexOptions.model);
  if (codexOptions.reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${codexOptions.reasoningEffort}"`);
  }
  if (codexOptions.fastMode) {
    args.push("-c", 'service_tier="fast"', "-c", "features.fast_mode=true");
  }
  if (tui) args.push("--json");
  args.push("--color", "never", prompt);

  return new Promise((resolvePromise, reject) => {
    const child = spawn("codex", args, {
      detached: Boolean(tui && process.platform !== "win32"),
      stdio: [tui ? "ignore" : "inherit", "pipe", tui ? "pipe" : "inherit"],
    });
    let finalMessage = "";
    const stdoutStream = { buffer: "" };
    const stderrStream = { buffer: "" };

    control?.attachChild(child);

    function handleJsonLine(line) {
      if (!line.trim()) return;
      tui.addRawLog(line);
      try {
        const update = describeCodexEvent(JSON.parse(line));
        if (update.markdown !== undefined) tui.addMarkdown(update.markdown);
        else tui.addActivity(update.activity);
        if (update.finalMessage !== undefined) finalMessage = update.finalMessage;
      } catch {
        tui.addActivity(`READ OUTPUT | The agent emits ${shorten(line, 80)}.`);
      }
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (tui) consumeJsonLines(chunk, stdoutStream, handleJsonLine);
      else finalMessage += chunk;
    });
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        consumeJsonLines(chunk, stderrStream, (line) => {
          tui?.addRawLog(`[stderr] ${line}`);
          tui?.addActivity(`READ ERROR | The agent emits ${shorten(line, 80)} on stderr.`);
        });
      });
    }
    child.on("error", reject);
    child.on("close", async (code, signal) => {
      if (tui && stdoutStream.buffer.trim()) handleJsonLine(stdoutStream.buffer);
      if (tui && stderrStream.buffer.trim()) {
        tui.addRawLog(`[stderr] ${stderrStream.buffer}`);
        tui.addActivity(
          `READ ERROR | The agent emits ${shorten(stderrStream.buffer, 80)} on stderr.`,
        );
      }
      control?.detachChild(child);
      resolvePromise({ code: code ?? 1, finalMessage: finalMessage.trim(), signal });
    });
  });
}
