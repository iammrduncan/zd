import "./terminal.css";

import { createTerminalEmulator, type TerminalEmulator } from "./emulator";
import type { TerminalThreadSession } from "./session";
import type {
  TerminalThreadMetadata,
  TerminalThreadSnapshot,
  TerminalThreadSurfaceOptions,
} from "./types";

export interface TerminalThreadSurface {
  readonly element: HTMLElement;
  readonly viewportElement: HTMLElement;
  closeSearch(): boolean;
  copySelection(): Promise<boolean>;
  dispose(): void;
  fit(): void;
  focus(): void;
  isSearchOpen(): boolean;
  openSearch(): void;
  paste(text: string): void;
  refreshTheme(): void;
  setVisible(visible: boolean): void;
  selectAll(): void;
  updateMetadata(metadata: TerminalThreadMetadata): void;
}

function terminalLabel(metadata: TerminalThreadMetadata, surface: "input" | "output"): string {
  return `${metadata.threadName} terminal ${surface}, ${metadata.projectName}, ${metadata.worktreeLabel}`;
}

function binaryBytes(data: string): Uint8Array {
  return Uint8Array.from(data, (character) => character.charCodeAt(0) & 0xff);
}

function isCopyShortcut(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== "c") return false;
  return event.metaKey || (event.ctrlKey && event.shiftKey);
}

function defaultClipboardWrite(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error("clipboard unavailable"));
  return navigator.clipboard.writeText(text);
}

/** Full VT/ANSI terminal surface backed by xterm and a project-scoped native session. */
export function mountTerminalThreadSurface(
  host: HTMLElement,
  terminal: TerminalThreadSession,
  metadata: TerminalThreadMetadata,
  options: TerminalThreadSurfaceOptions = {},
): TerminalThreadSurface {
  const root = document.createElement("section");
  root.className = "zd-terminal-thread-surface";
  root.setAttribute("aria-label", `${metadata.threadName} terminal thread`);

  const header = document.createElement("header");
  header.className = "zd-terminal-thread-header";
  const heading = document.createElement("p");
  heading.className = "zd-terminal-thread-metadata";
  heading.textContent = `${metadata.threadName} · ${metadata.projectName} · ${metadata.worktreeLabel}`;
  const summonSearch = document.createElement("button");
  summonSearch.type = "button";
  summonSearch.className = "zd-terminal-thread-search-toggle";
  summonSearch.setAttribute("aria-label", "Find in terminal output");
  summonSearch.textContent = "Find";
  header.append(heading, summonSearch);

  const search = document.createElement("div");
  search.className = "zd-terminal-thread-search";
  search.hidden = true;
  const query = document.createElement("input");
  query.type = "search";
  query.spellcheck = false;
  query.autocomplete = "off";
  query.setAttribute("aria-label", "Find in terminal");
  const caseLabel = document.createElement("label");
  caseLabel.className = "zd-terminal-thread-search-option";
  const caseSensitive = document.createElement("input");
  caseSensitive.type = "checkbox";
  caseSensitive.setAttribute("aria-label", "Match terminal case");
  caseLabel.append(caseSensitive, document.createTextNode("Aa"));
  const previous = document.createElement("button");
  previous.type = "button";
  previous.setAttribute("aria-label", "Previous terminal match");
  previous.textContent = "↑";
  const next = document.createElement("button");
  next.type = "button";
  next.setAttribute("aria-label", "Next terminal match");
  next.textContent = "↓";
  const searchStatus = document.createElement("span");
  searchStatus.className = "zd-terminal-thread-search-status";
  searchStatus.setAttribute("role", "status");
  searchStatus.setAttribute("aria-live", "polite");
  const closeSearch = document.createElement("button");
  closeSearch.type = "button";
  closeSearch.setAttribute("aria-label", "Close terminal search");
  closeSearch.textContent = "×";
  search.append(query, caseLabel, previous, next, searchStatus, closeSearch);

  const viewport = document.createElement("div");
  viewport.className = "zd-terminal-thread-viewport";
  viewport.setAttribute("role", "application");
  viewport.setAttribute("aria-label", terminalLabel(metadata, "output"));
  const problem = document.createElement("p");
  problem.className = "zd-terminal-thread-status";
  problem.setAttribute("role", "status");
  problem.setAttribute("aria-live", "polite");
  problem.hidden = true;
  root.append(header, search, viewport, problem);
  host.append(root);

  const emulator: TerminalEmulator = (options.createEmulator ?? createTerminalEmulator)(
    terminal.scrollbackRows,
  );
  emulator.open(viewport, terminalLabel(metadata, "input"));

  let active = true;
  let lastViewport = "";
  let resizeFrame: number | null = null;
  let visible = true;

  const render = (snapshot: TerminalThreadSnapshot) => {
    root.dataset.terminalStatus = snapshot.status;
    const problems: string[] = [];
    if (snapshot.droppedBytes > 0) {
      problems.push(`${snapshot.droppedBytes} earlier output bytes were released.`);
    }
    if (snapshot.discardedRows > 0) {
      problems.push(`${snapshot.discardedRows} earlier scrollback rows were released.`);
    }
    if (snapshot.readError) problems.push("Terminal output stopped unexpectedly.");
    problem.textContent = problems.join(" ");
    problem.hidden = problems.length === 0;
  };

  const reportFailure = () => {
    if (!active) return;
    problem.textContent = "Terminal input is unavailable.";
    problem.hidden = false;
  };

  const writeText = (data: string) => {
    void terminal.writeText(data).catch(reportFailure);
  };
  const writeBinary = (data: string) => {
    void terminal.writeBytes(binaryBytes(data)).catch(reportFailure);
  };
  const writeClipboard = options.writeClipboard ?? defaultClipboardWrite;
  const copySelection = async (): Promise<boolean> => {
    if (!emulator.hasSelection()) return false;
    await writeClipboard(emulator.getSelection());
    return true;
  };
  const handleKey = (event: KeyboardEvent): boolean => {
    if (options.applicationOwnsKey?.(event)) return false;
    if (!isCopyShortcut(event) || !emulator.hasSelection()) return true;
    if (event.type === "keydown") void copySelection().catch(reportFailure);
    return false;
  };
  emulator.attachCustomKeyEventHandler(handleKey);

  const searchOptions = (incremental: boolean) => ({
    caseSensitive: caseSensitive.checked,
    incremental,
  });
  const findNext = (incremental: boolean) => {
    if (!query.value) {
      emulator.clearSearch();
      searchStatus.textContent = "";
      return false;
    }
    return emulator.findNext(query.value, searchOptions(incremental));
  };
  const findPrevious = () => {
    if (!query.value) return false;
    return emulator.findPrevious(query.value, searchOptions(false));
  };

  const refreshTheme = () => emulator.refreshTheme(root);
  const fit = () => {
    if (!active || !visible) return;
    const dimensions = emulator.fit();
    if (!dimensions) return;
    const nextViewport = {
      rows: dimensions.rows,
      columns: dimensions.columns,
      pixelWidth: Math.max(0, Math.round(viewport.clientWidth)),
      pixelHeight: Math.max(0, Math.round(viewport.clientHeight)),
    };
    const viewportKey = `${nextViewport.columns}x${nextViewport.rows}@${nextViewport.pixelWidth}x${nextViewport.pixelHeight}`;
    if (viewportKey === lastViewport) return;
    lastViewport = viewportKey;
    void terminal.resize(nextViewport).catch(() => {
      if (lastViewport === viewportKey) lastViewport = "";
      reportFailure();
    });
  };
  const scheduleFit = () => {
    if (!active || !visible) return;
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      fit();
    });
  };

  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit);
  resizeObserver?.observe(viewport);
  const themeRoot = document.documentElement;
  const themeObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          if (active) refreshTheme();
        });
  themeObserver?.observe(themeRoot, {
    attributes: true,
    attributeFilter: ["style", "data-theme", "data-theme-name"],
  });

  const openSearchPanel = () => {
    search.hidden = false;
    summonSearch.setAttribute("aria-expanded", "true");
    query.focus();
    query.select();
    findNext(true);
  };
  const closeSearchPanel = (): boolean => {
    if (search.hidden) return false;
    search.hidden = true;
    summonSearch.setAttribute("aria-expanded", "false");
    emulator.clearSearch();
    searchStatus.textContent = "";
    emulator.focus();
    return true;
  };
  summonSearch.setAttribute("aria-expanded", "false");
  summonSearch.addEventListener("click", openSearchPanel);
  closeSearch.addEventListener("click", closeSearchPanel);
  query.addEventListener("input", () => findNext(true));
  caseSensitive.addEventListener("change", () => findNext(true));
  previous.addEventListener("click", findPrevious);
  next.addEventListener("click", () => findNext(false));

  refreshTheme();
  render(terminal.snapshot());
  const unsubscribeState = terminal.subscribe(render);
  const unsubscribeOutput = terminal.subscribeOutput((bytes) => emulator.write(bytes));
  const unsubscribeData = emulator.onData(writeText);
  const unsubscribeBinary = emulator.onBinary(writeBinary);
  const unsubscribeSearch = emulator.onSearchResults(({ resultIndex, resultCount }) => {
    searchStatus.textContent =
      resultCount > 0 && resultIndex >= 0 ? `${resultIndex + 1} of ${resultCount}` : "No results";
  });
  scheduleFit();

  const dispose = () => {
    if (!active) return;
    active = false;
    unsubscribeSearch();
    unsubscribeBinary();
    unsubscribeData();
    unsubscribeOutput();
    unsubscribeState();
    themeObserver?.disconnect();
    resizeObserver?.disconnect();
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    emulator.dispose();
    root.remove();
  };

  return {
    element: root,
    viewportElement: viewport,
    closeSearch: closeSearchPanel,
    copySelection,
    dispose,
    fit,
    focus: () => emulator.focus(),
    isSearchOpen: () => !search.hidden,
    openSearch: openSearchPanel,
    paste: (text) => emulator.paste(text),
    refreshTheme,
    setVisible: (nextVisible) => {
      visible = nextVisible;
      root.hidden = !visible;
      root.setAttribute("aria-hidden", String(!visible));
      if (visible) {
        refreshTheme();
        scheduleFit();
      }
    },
    selectAll: () => emulator.selectAll(),
    updateMetadata: (nextMetadata) => {
      root.setAttribute("aria-label", `${nextMetadata.threadName} terminal thread`);
      heading.textContent = `${nextMetadata.threadName} · ${nextMetadata.projectName} · ${nextMetadata.worktreeLabel}`;
      viewport.setAttribute("aria-label", terminalLabel(nextMetadata, "output"));
      emulator.setLabel(terminalLabel(nextMetadata, "input"));
    },
  };
}
