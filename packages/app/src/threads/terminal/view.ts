import "./terminal.css";

import { terminalInputBytes } from "./input";
import type { TerminalThreadSession } from "./session";
import type {
  TerminalThreadMetadata,
  TerminalThreadSnapshot,
  TerminalThreadSurfaceOptions,
} from "./types";

export type TerminalThreadSurfaceUnmount = () => void;

function terminalLabel(metadata: TerminalThreadMetadata, surface: "input" | "output"): string {
  return `${metadata.threadName} terminal ${surface}, ${metadata.projectName}, ${metadata.worktreeLabel}`;
}

function positiveMetric(value: string): number | null {
  const metric = Number.parseFloat(value);
  return Number.isFinite(metric) && metric > 0 ? metric : null;
}

/** Dependency-free transcript surface; the session contract can later host a full emulator. */
export function mountTerminalThreadSurface(
  host: HTMLElement,
  terminal: TerminalThreadSession,
  metadata: TerminalThreadMetadata,
  options: TerminalThreadSurfaceOptions = {},
): TerminalThreadSurfaceUnmount {
  const root = document.createElement("section");
  root.className = "zd-terminal-thread-surface";
  root.setAttribute("aria-label", `${metadata.threadName} terminal thread`);

  const heading = document.createElement("p");
  heading.className = "zd-terminal-thread-metadata";
  heading.textContent = `${metadata.threadName} · ${metadata.projectName} · ${metadata.worktreeLabel}`;
  const output = document.createElement("pre");
  output.className = "zd-terminal-thread-output";
  output.tabIndex = 0;
  output.setAttribute("role", "log");
  output.setAttribute("aria-live", "off");
  output.setAttribute("aria-label", terminalLabel(metadata, "output"));
  const status = document.createElement("p");
  status.className = "zd-terminal-thread-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  const input = document.createElement("textarea");
  input.className = "zd-terminal-thread-input";
  input.rows = 1;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.autocapitalize = "off";
  input.setAttribute("aria-label", terminalLabel(metadata, "input"));
  root.append(heading, output, status, input);
  host.append(root);

  let active = true;
  let resizeFrame: number | null = null;

  const render = (snapshot: TerminalThreadSnapshot) => {
    output.textContent = snapshot.rows.join("\n");
    root.dataset.terminalStatus = snapshot.status;
    const problems: string[] = [];
    if (snapshot.droppedBytes > 0) {
      problems.push(`${snapshot.droppedBytes} earlier output bytes were released.`);
    }
    if (snapshot.discardedRows > 0) {
      problems.push(`${snapshot.discardedRows} earlier scrollback rows were released.`);
    }
    if (snapshot.readError) problems.push("Terminal output stopped unexpectedly.");
    status.textContent = problems.join(" ");
    status.hidden = problems.length === 0;
  };

  const reportFailure = () => {
    if (!active) return;
    status.textContent = "Terminal input is unavailable.";
    status.hidden = false;
  };

  const send = (bytes: readonly number[]) => {
    const text = new TextDecoder().decode(Uint8Array.from(bytes));
    void terminal.writeText(text).catch(reportFailure);
  };

  input.addEventListener("keydown", (event) => {
    if (options.applicationOwnsKey?.(event)) return;
    const usesInputEvent =
      event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (usesInputEvent || event.isComposing) return;
    const bytes = terminalInputBytes(event);
    if (!bytes) return;
    event.preventDefault();
    send(bytes);
  });
  input.addEventListener("input", (event) => {
    if (event instanceof InputEvent && event.isComposing) return;
    const value = input.value;
    input.value = "";
    if (value) void terminal.writeText(value).catch(reportFailure);
  });
  root.addEventListener("click", (event) => {
    if (event.target === root) input.focus();
  });

  const measureAndResize = () => {
    resizeFrame = null;
    if (!active) return;
    const style = getComputedStyle(output);
    const lineHeight = positiveMetric(style.lineHeight);
    const fontSize = positiveMetric(style.fontSize);
    if (!lineHeight || !fontSize || output.clientWidth <= 0 || output.clientHeight <= 0) return;
    const measure = document.createElement("span");
    measure.className = "zd-terminal-thread-measure";
    measure.textContent = "MMMMMMMMMM";
    output.append(measure);
    const characterWidth = measure.getBoundingClientRect().width / 10;
    measure.remove();
    if (characterWidth <= 0) return;
    const viewport = {
      rows: Math.max(1, Math.floor(output.clientHeight / lineHeight)),
      columns: Math.max(1, Math.floor(output.clientWidth / characterWidth)),
      pixelWidth: Math.max(0, Math.round(output.clientWidth)),
      pixelHeight: Math.max(0, Math.round(output.clientHeight)),
    };
    void terminal.resize(viewport).catch(reportFailure);
  };
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(measureAndResize);
        });
  resizeObserver?.observe(output);

  render(terminal.snapshot());
  const unsubscribe = terminal.subscribe(render);
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    resizeObserver?.disconnect();
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    root.remove();
  };
}
