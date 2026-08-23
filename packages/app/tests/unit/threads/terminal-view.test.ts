import { describe, expect, it, vi } from "vitest";

import {
  TerminalThreadSession,
  mountTerminalThreadSurface,
  type TerminalEmulator,
  type TerminalEmulatorSearchOptions,
  type TerminalEmulatorSearchResults,
} from "@/threads";
import type { TerminalAdapter, TerminalSessionHandle } from "@/terminal";

const session: TerminalSessionHandle = {
  sessionId: "session-alpha",
  projectId: "project-alpha",
  worktreeId: "worktree-alpha",
};

function adapter(output = "hello 👩🏽‍💻"): TerminalAdapter & { write: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(async () => session),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    read: vi.fn(async () => ({
      session,
      offset: 0,
      droppedBefore: 0,
      bytes: [...new TextEncoder().encode(output)],
      readError: null,
    })),
    pollExit: vi.fn(async () => null),
    terminate: vi.fn(async () => ({ reason: "terminated" as const, code: null, signal: null })),
    dispose: vi.fn(async () => undefined),
  };
}

class FakeEmulator implements TerminalEmulator {
  columns = 80;
  rows = 24;
  readonly writes: Uint8Array[] = [];
  readonly searches: Array<{
    direction: "next" | "previous";
    query: string;
    options: TerminalEmulatorSearchOptions;
  }> = [];
  readonly refreshTheme = vi.fn();
  disposed = false;
  selection = "";
  keyHandler: ((event: KeyboardEvent) => boolean) | null = null;
  mounted: HTMLElement | null = null;
  #binary: ((data: string) => void) | null = null;
  #data: ((data: string) => void) | null = null;
  #searchResults: ((results: TerminalEmulatorSearchResults) => void) | null = null;
  #titleChange: ((title: string) => void) | null = null;

  open(host: HTMLElement, label: string): void {
    const focusTarget = document.createElement("textarea");
    focusTarget.setAttribute("aria-label", label);
    host.append(focusTarget);
    this.mounted = host;
  }

  write(bytes: Uint8Array): void {
    this.writes.push(bytes.slice());
  }

  onData(listener: (data: string) => void): () => void {
    this.#data = listener;
    return () => {
      this.#data = null;
    };
  }

  onBinary(listener: (data: string) => void): () => void {
    this.#binary = listener;
    return () => {
      this.#binary = null;
    };
  }

  onSearchResults(listener: (results: TerminalEmulatorSearchResults) => void): () => void {
    this.#searchResults = listener;
    return () => {
      this.#searchResults = null;
    };
  }

  onTitleChange(listener: (title: string) => void): () => void {
    this.#titleChange = listener;
    return () => {
      this.#titleChange = null;
    };
  }

  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }

  setLabel(label: string): void {
    this.mounted?.querySelector("textarea")?.setAttribute("aria-label", label);
  }

  focus(): void {
    this.mounted?.querySelector("textarea")?.focus();
  }

  fit(): { columns: number; rows: number } {
    this.columns = 92;
    this.rows = 31;
    return { columns: this.columns, rows: this.rows };
  }

  hasSelection(): boolean {
    return this.selection.length > 0;
  }

  getSelection(): string {
    return this.selection;
  }

  paste(data: string): void {
    this.emitData(data);
  }

  selectAll(): void {
    this.selection = "all output";
  }

  findNext(query: string, options: TerminalEmulatorSearchOptions): boolean {
    this.searches.push({ direction: "next", query, options });
    return true;
  }

  findPrevious(query: string, options: TerminalEmulatorSearchOptions): boolean {
    this.searches.push({ direction: "previous", query, options });
    return true;
  }

  clearSearch(): void {}

  dispose(): void {
    this.disposed = true;
  }

  emitData(data: string): void {
    this.#data?.(data);
  }

  emitBinary(data: string): void {
    this.#binary?.(data);
  }

  emitSearchResults(results: TerminalEmulatorSearchResults): void {
    this.#searchResults?.(results);
  }

  emitTitle(title: string): void {
    this.#titleChange?.(title);
  }
}

const metadata = {
  threadName: "Review",
  projectName: "Alpha",
  worktreeLabel: "feature/review",
};

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("the terminal thread surface", () => {
  it("feeds raw ANSI and Unicode bytes to one bounded emulator surface", async () => {
    const bytes = "\u001b[31mhello 👩🏽‍💻\u001b[0m";
    const native = adapter(bytes);
    const terminal = TerminalThreadSession.attach(native, session);
    const emulator = new FakeEmulator();
    const host = document.createElement("div");
    document.body.append(host);
    const surface = mountTerminalThreadSurface(host, terminal, metadata, {
      createEmulator: () => emulator,
    });

    await terminal.refresh();

    expect(new TextDecoder().decode(emulator.writes[0])).toBe(bytes);
    expect(surface.element.getAttribute("aria-label")).toBe("Review terminal thread");
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toContain(
      "Review terminal input",
    );
    expect(host.querySelector("script")).toBeNull();
    expect(emulator.refreshTheme).toHaveBeenCalledWith(surface.viewportElement);
    surface.focus();
    expect(document.activeElement).toBe(host.querySelector("textarea"));
  });

  it("forwards text and binary input, preserves app shortcuts, and copies grapheme selections", async () => {
    const native = adapter();
    const terminal = TerminalThreadSession.attach(native, session);
    const emulator = new FakeEmulator();
    const copy = vi.fn(async () => undefined);
    const host = document.createElement("div");
    mountTerminalThreadSurface(host, terminal, metadata, {
      createEmulator: () => emulator,
      applicationOwnsKey: (event) => event.metaKey && event.key.toLowerCase() === "j",
      writeClipboard: copy,
    });

    emulator.emitData("日本語");
    emulator.emitBinary("\u0000\u00ff");
    expect(
      emulator.keyHandler?.(
        new KeyboardEvent("keydown", { key: "j", metaKey: true, cancelable: true }),
      ),
    ).toBe(false);
    emulator.selection = "👩🏽‍💻";
    expect(
      emulator.keyHandler?.(
        new KeyboardEvent("keydown", { key: "c", metaKey: true, cancelable: true }),
      ),
    ).toBe(false);
    await vi.waitFor(() => expect(native.write).toHaveBeenCalledTimes(2));

    expect(native.write).toHaveBeenNthCalledWith(1, session, [
      ...new TextEncoder().encode("日本語"),
    ]);
    expect(native.write).toHaveBeenNthCalledWith(2, session, [0, 255]);
    expect(copy).toHaveBeenCalledWith("👩🏽‍💻");
  });

  it("offers incremental next/previous search with an accessible result count", () => {
    const terminal = TerminalThreadSession.attach(adapter(), session);
    const emulator = new FakeEmulator();
    const host = document.createElement("div");
    const surface = mountTerminalThreadSurface(host, terminal, metadata, {
      createEmulator: () => emulator,
    });

    surface.openSearch();
    const query = host.querySelector<HTMLInputElement>('[aria-label="Find in terminal"]')!;
    query.value = "hello";
    query.dispatchEvent(new InputEvent("input", { bubbles: true }));
    emulator.emitSearchResults({ resultIndex: 0, resultCount: 2 });
    host.querySelector<HTMLButtonElement>('[aria-label="Previous terminal match"]')!.click();

    expect(emulator.searches).toEqual([
      {
        direction: "next",
        query: "hello",
        options: { caseSensitive: false, incremental: true },
      },
      {
        direction: "previous",
        query: "hello",
        options: { caseSensitive: false, incremental: false },
      },
    ]);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("1 of 2");
    expect(surface.closeSearch()).toBe(true);
    expect(surface.closeSearch()).toBe(false);
  });

  it("forwards terminal-owned title changes and detaches them with the surface", () => {
    const terminal = TerminalThreadSession.attach(adapter(), session);
    const emulator = new FakeEmulator();
    const onTitleChange = vi.fn();
    const host = document.createElement("div");
    const surface = mountTerminalThreadSurface(host, terminal, metadata, {
      createEmulator: () => emulator,
      onTitleChange,
    });

    emulator.emitTitle("npm test");
    expect(onTitleChange).toHaveBeenCalledExactlyOnceWith("npm test");

    surface.dispose();
    emulator.emitTitle("zsh");
    expect(onTitleChange).toHaveBeenCalledOnce();
  });

  it("coalesces fitting into native resize, refreshes theme in place, and disposes cleanly", async () => {
    const native = adapter();
    const terminal = TerminalThreadSession.attach(native, session);
    const emulator = new FakeEmulator();
    const host = document.createElement("div");
    const surface = mountTerminalThreadSurface(host, terminal, metadata, {
      createEmulator: () => emulator,
    });
    Object.defineProperties(surface.viewportElement, {
      clientWidth: { value: 640 },
      clientHeight: { value: 420 },
    });

    surface.fit();
    surface.refreshTheme();
    await settle();

    expect(native.resize).toHaveBeenCalledWith(session, {
      columns: 92,
      rows: 31,
      pixelWidth: 640,
      pixelHeight: 420,
    });
    expect(emulator.refreshTheme).toHaveBeenCalled();
    surface.dispose();
    expect(emulator.disposed).toBe(true);
  });
});
