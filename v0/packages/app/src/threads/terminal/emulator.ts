import "@xterm/xterm/css/xterm.css";

import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import { Terminal as XtermTerminal, type ITheme } from "@xterm/xterm";

const COMPOSITION_KEY_CODE = 229;
const DELETE_CHARACTER = "\u007f";
const TEXTAREA_EDIT_WINDOW_MS = 100;

export interface TerminalEmulatorSearchOptions {
  readonly caseSensitive: boolean;
  readonly incremental: boolean;
}

export interface TerminalEmulatorSearchResults {
  readonly resultIndex: number;
  readonly resultCount: number;
}

export interface TerminalEmulator {
  readonly columns: number;
  readonly rows: number;
  open(host: HTMLElement, label: string): void;
  write(bytes: Uint8Array): Promise<void>;
  onData(listener: (data: string) => void): () => void;
  onBinary(listener: (data: string) => void): () => void;
  onSearchResults(listener: (results: TerminalEmulatorSearchResults) => void): () => void;
  onTitleChange(listener: (title: string) => void): () => void;
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
  setLabel(label: string): void;
  focus(): void;
  fit(): { columns: number; rows: number } | null;
  hasSelection(): boolean;
  getSelection(): string;
  paste(text: string): void;
  selectAll(): void;
  findNext(query: string, options: TerminalEmulatorSearchOptions): boolean;
  findPrevious(query: string, options: TerminalEmulatorSearchOptions): boolean;
  clearSearch(): void;
  refreshTheme(source: HTMLElement): void;
  dispose(): void;
}

export type TerminalEmulatorFactory = (scrollbackRows: number) => TerminalEmulator;

function resolvedColour(source: HTMLElement, property: string, fallback: string): string {
  const probe = source.ownerDocument.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.color = `var(${property})`;
  source.append(probe);
  const value = getComputedStyle(probe).color.trim();
  probe.remove();
  return value || fallback;
}

function resolvedTheme(source: HTMLElement): ITheme {
  const canvas = resolvedColour(source, "--surface-canvas", "#fafaf7");
  const foreground = resolvedColour(source, "--text-primary", "#242522");
  const secondary = resolvedColour(source, "--text-secondary", "#5f625c");
  const selection = resolvedColour(source, "--surface-selection", "#e7e8e2");
  const red = resolvedColour(source, "--state-deleted", "#8a4d4a");
  const green = resolvedColour(source, "--state-added", "#2d5338");
  const yellow = resolvedColour(source, "--state-changed", "#85682c");
  const blue = resolvedColour(source, "--text-link", "#284c5b");
  const magenta = resolvedColour(source, "--syntax-keyword", "#7a3d55");
  const cyan = resolvedColour(source, "--syntax-type", "#315e73");
  return {
    background: canvas,
    foreground,
    cursor: foreground,
    cursorAccent: canvas,
    selectionBackground: selection,
    selectionInactiveBackground: selection,
    black: canvas,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white: foreground,
    brightBlack: secondary,
    brightRed: red,
    brightGreen: green,
    brightYellow: yellow,
    brightBlue: blue,
    brightMagenta: magenta,
    brightCyan: cyan,
    brightWhite: foreground,
  };
}

function fontOptions(source: HTMLElement): {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
} {
  const style = getComputedStyle(source);
  const fontSize = Number.parseFloat(style.fontSize) || 13;
  const lineHeight = Number.parseFloat(style.lineHeight);
  const terminalCellLine = Number.parseFloat(style.getPropertyValue("--type-terminal-cell-line"));
  return {
    fontFamily: style.fontFamily || "monospace",
    fontSize,
    lineHeight:
      Number.isFinite(terminalCellLine) && terminalCellLine >= 1
        ? terminalCellLine
        : Number.isFinite(lineHeight) && lineHeight > 0
          ? lineHeight / fontSize
          : 1.35,
  };
}

function opaqueHex(colour: string, fallback: string): string {
  const shortHex = /^#([0-9a-f]{3})$/i.exec(colour);
  if (shortHex) {
    return `#${[...shortHex[1]!].map((value) => value.repeat(2)).join("")}`;
  }
  const hex = /^#[0-9a-f]{6}$/i.exec(colour);
  if (hex) return hex[0];
  const rgb = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(colour);
  if (!rgb) return fallback;
  return `#${rgb
    .slice(1, 4)
    .map((value) => Math.min(255, Number(value)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function textareaEditData(before: string, after: string): string {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const inserted = after.slice(prefix, after.length - suffix);
  if (inserted) return inserted;
  return DELETE_CHARACTER.repeat(before.length - prefix - suffix);
}

function isLegacyTextareaEmission(data: string, before: string, after: string): boolean {
  if (after.length > before.length) return data === after.replace(before, "");
  if (after.length < before.length) return data === DELETE_CHARACTER;
  return before !== after && data === after;
}

class XtermEmulator implements TerminalEmulator {
  readonly #fit = new FitAddon();
  readonly #search = new SearchAddon({ highlightLimit: 1_000 });
  readonly #terminal: XtermTerminal;
  #host: HTMLElement | null = null;
  #pendingTextareaEdit: string | null = null;
  #pendingTextareaEditTimer: number | null = null;
  #theme: ITheme = {};

  constructor(scrollbackRows: number) {
    this.#terminal = new XtermTerminal({
      // The matching official Search addon uses xterm's decoration API for
      // bounded result counts and highlights.
      allowProposedApi: true,
      allowTransparency: false,
      cursorBlink: false,
      cursorInactiveStyle: "outline",
      minimumContrastRatio: 1,
      rightClickSelectsWord: true,
      screenReaderMode: true,
      scrollback: scrollbackRows,
      smoothScrollDuration: 0,
    });
    this.#terminal.loadAddon(this.#fit);
    this.#terminal.loadAddon(this.#search);
  }

  get columns(): number {
    return this.#terminal.cols;
  }

  get rows(): number {
    return this.#terminal.rows;
  }

  open(host: HTMLElement, label: string): void {
    this.#host = host;
    this.#terminal.open(host);
    this.setLabel(label);
  }

  write(bytes: Uint8Array): Promise<void> {
    return new Promise((resolve) => this.#terminal.write(bytes, resolve));
  }

  onData(listener: (data: string) => void): () => void {
    const subscription = this.#terminal.onData((data) => {
      const before = this.#pendingTextareaEdit;
      const textarea = this.#host?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
      const after = textarea?.value;
      // xterm 5.5 can emit the whole retained textarea after a keyCode 229 edit
      // (xtermjs/xterm.js#6078). Replace only that legacy emission with its delta.
      if (before !== null && after !== undefined && isLegacyTextareaEmission(data, before, after)) {
        this.#clearPendingTextareaEdit();
        listener(textareaEditData(before, after));
        return;
      }
      listener(data);
    });
    return () => subscription.dispose();
  }

  onBinary(listener: (data: string) => void): () => void {
    const subscription = this.#terminal.onBinary(listener);
    return () => subscription.dispose();
  }

  onSearchResults(listener: (results: TerminalEmulatorSearchResults) => void): () => void {
    const subscription = this.#search.onDidChangeResults(listener);
    return () => subscription.dispose();
  }

  onTitleChange(listener: (title: string) => void): () => void {
    const subscription = this.#terminal.onTitleChange(listener);
    return () => subscription.dispose();
  }

  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.#terminal.attachCustomKeyEventHandler((event) => {
      const accepted = handler(event);
      if (
        accepted &&
        event.type === "keydown" &&
        event.keyCode === COMPOSITION_KEY_CODE &&
        !event.isComposing
      ) {
        const textarea = this.#host?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
        if (textarea) {
          this.#pendingTextareaEdit = textarea.value;
          if (this.#pendingTextareaEditTimer !== null) {
            window.clearTimeout(this.#pendingTextareaEditTimer);
          }
          this.#pendingTextareaEditTimer = window.setTimeout(
            () => this.#clearPendingTextareaEdit(),
            TEXTAREA_EDIT_WINDOW_MS,
          );
        }
      }
      return accepted;
    });
  }

  setLabel(label: string): void {
    const textarea = this.#host?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
    if (!textarea) return;
    textarea.name = "terminal-input";
    textarea.setAttribute("aria-label", label);
  }

  focus(): void {
    this.#terminal.focus();
  }

  fit(): { columns: number; rows: number } | null {
    const dimensions = this.#fit.proposeDimensions();
    if (
      !dimensions ||
      !Number.isFinite(dimensions.cols) ||
      !Number.isFinite(dimensions.rows) ||
      dimensions.cols < 1 ||
      dimensions.rows < 1
    ) {
      return null;
    }
    // FitAddon dimensions are measurements and can be fractional in WebKit or
    // emulated browser viewports; xterm's resize contract accepts integers only.
    const columns = Math.max(1, Math.floor(dimensions.cols));
    const rows = Math.max(1, Math.floor(dimensions.rows));
    if (columns !== this.#terminal.cols || rows !== this.#terminal.rows) {
      this.#terminal.resize(columns, rows);
    }
    return { columns, rows };
  }

  hasSelection(): boolean {
    return this.#terminal.hasSelection();
  }

  getSelection(): string {
    return this.#terminal.getSelection();
  }

  paste(text: string): void {
    this.#terminal.paste(text);
  }

  selectAll(): void {
    this.#terminal.selectAll();
  }

  #searchOptions(options: TerminalEmulatorSearchOptions): ISearchOptions {
    const match = opaqueHex(this.#theme.selectionBackground ?? "", "#e7e8e2");
    const active = opaqueHex(this.#theme.yellow ?? "", "#85682c");
    return {
      ...options,
      decorations: {
        matchBackground: match,
        matchOverviewRuler: match,
        activeMatchBackground: active,
        activeMatchColorOverviewRuler: active,
      },
    };
  }

  findNext(query: string, options: TerminalEmulatorSearchOptions): boolean {
    return this.#search.findNext(query, this.#searchOptions(options));
  }

  findPrevious(query: string, options: TerminalEmulatorSearchOptions): boolean {
    return this.#search.findPrevious(query, this.#searchOptions(options));
  }

  clearSearch(): void {
    this.#search.clearDecorations();
  }

  refreshTheme(source: HTMLElement): void {
    this.#theme = resolvedTheme(source);
    this.#terminal.options = { ...fontOptions(source), theme: this.#theme };
  }

  dispose(): void {
    this.#clearPendingTextareaEdit();
    this.#terminal.dispose();
  }

  #clearPendingTextareaEdit(): void {
    this.#pendingTextareaEdit = null;
    if (this.#pendingTextareaEditTimer !== null) {
      window.clearTimeout(this.#pendingTextareaEditTimer);
      this.#pendingTextareaEditTimer = null;
    }
  }
}

export const createTerminalEmulator: TerminalEmulatorFactory = (scrollbackRows) =>
  new XtermEmulator(scrollbackRows);
