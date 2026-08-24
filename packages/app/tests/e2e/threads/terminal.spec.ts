import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    terminalFixture: {
      calls: string[];
      copied: string[];
      copySelection(): Promise<boolean>;
      paste(text: string): void;
      selectAll(): void;
    };
  }
}

const CONTENTS = [
  "status: pending\rstatus: ready  ",
  "\u001b[31mred\u001b[0m · hello 👩🏽‍💻",
  "<script>unsafe()</script>",
  "日本語",
].join("\r\n");

async function mountFixture(page: Page, refresh = true, contents = CONTENTS): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    async ({ contents, readOutput }) => {
      const modulePath = "/src/threads/index.ts";
      const { TerminalThreadSession, mountTerminalThreadSurface } = (await import(
        /* @vite-ignore */ modulePath
      )) as typeof import("../../../src/threads");
      const session: import("../../../src/terminal").TerminalSessionHandle = {
        sessionId: "session-browser",
        projectId: "project-alpha",
        worktreeId: "worktree-alpha",
      };
      const calls: string[] = [];
      const copied: string[] = [];
      const adapter: import("../../../src/terminal").TerminalAdapter = {
        start: async () => session,
        write: async (_session, bytes) => {
          calls.push(`write:${new TextDecoder().decode(Uint8Array.from(bytes))}`);
        },
        resize: async (_session, viewport) => {
          calls.push(`resize:${viewport.columns}x${viewport.rows}`);
        },
        read: async () => {
          calls.push("read");
          return {
            session,
            offset: 0,
            droppedBefore: 0,
            bytes: [...new TextEncoder().encode(contents)],
            readError: null,
          };
        },
        pollExit: async () => {
          calls.push("poll-exit");
          return null;
        },
        terminate: async () => ({ reason: "terminated", code: null, signal: null }),
        dispose: async () => undefined,
      };
      const terminal = TerminalThreadSession.attach(adapter, session, { maximumRows: 100 });
      const host = document.createElement("main");
      host.id = "terminal-fixture";
      host.style.width = "720px";
      host.style.height = "480px";
      document.body.replaceChildren(host);
      const surface = mountTerminalThreadSurface(
        host,
        terminal,
        { threadName: "Review", projectName: "Alpha", worktreeLabel: "feature/review" },
        {
          applicationOwnsKey: (event) => event.metaKey && event.key.toLowerCase() === "j",
          writeClipboard: async (text) => {
            copied.push(text);
          },
        },
      );
      if (readOutput) await terminal.refresh();
      surface.focus();
      window.terminalFixture = {
        calls,
        copied,
        copySelection: () => surface.copySelection(),
        paste: (text) => surface.paste(text),
        selectAll: () => surface.selectAll(),
      };
    },
    { contents, readOutput: refresh },
  );
}

test("renders VT cursor updates, ANSI, Unicode, and untrusted output accessibly", async ({
  page,
}) => {
  await mountFixture(page);

  const output = page.getByRole("application", { name: /Review terminal output.*Alpha/ });
  await expect(output).toContainText("status: ready");
  await expect(output).not.toContainText("status: pending");
  await expect(output).toContainText("red · hello 👩🏽‍💻");
  await expect(output).toContainText("<script>unsafe()</script>");
  await expect(output).toContainText("日本語");
  await expect(page.locator("#terminal-fixture script")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /Review terminal input/ })).toBeFocused();

  const typography = await page.locator(".zd-terminal-thread-viewport").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      size: Number.parseFloat(style.fontSize),
      lineHeight: Number.parseFloat(style.lineHeight),
      foreground: style.color,
      background: style.backgroundColor,
    };
  });
  expect(typography.family).toContain("iA Writer Mono");
  expect(typography.size).toBe(14);
  expect(typography.lineHeight).toBeCloseTo(22, 0);
  expect(typography.foreground).not.toBe(typography.background);
  const renderedRow = await page
    .locator('.xterm-accessibility-tree [role="listitem"]')
    .first()
    .evaluate((row) => {
      const style = getComputedStyle(row);
      return {
        height: row.getBoundingClientRect().height,
        inlineHeight: (row as HTMLElement).style.height,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
      };
    });
  expect(renderedRow.fontFamily).toContain("iA Writer Mono");
  expect(renderedRow.fontSize).toBe("14px");
  expect(renderedRow.inlineHeight).toBe("22px");
  expect(renderedRow.height).toBeCloseTo(22, 0);
});

test("fills its host without drawing a focus outline around the terminal pane", async ({
  page,
}) => {
  await mountFixture(page);

  const geometry = await page.locator(".zd-terminal-thread-surface").evaluate((surface) => {
    const host = surface.parentElement!;
    const style = getComputedStyle(surface);
    const viewport = surface.querySelector<HTMLElement>(".zd-terminal-thread-viewport")!;
    const viewportStyle = getComputedStyle(viewport);
    const screen = surface.querySelector<HTMLElement>(".xterm-screen")!;
    const contentHeight =
      viewport.clientHeight -
      Number.parseFloat(viewportStyle.paddingTop) -
      Number.parseFloat(viewportStyle.paddingBottom);
    return {
      hostBottom: host.getBoundingClientRect().bottom,
      surfaceBottom: surface.getBoundingClientRect().bottom,
      outlineStyle: style.outlineStyle,
      canvasHeightDelta: Math.abs(contentHeight - screen.getBoundingClientRect().height),
      lineHeight: Number.parseFloat(viewportStyle.lineHeight),
    };
  });

  expect(geometry.surfaceBottom).toBe(geometry.hostBottom);
  expect(geometry.outlineStyle).toBe("none");
  expect(geometry.canvasHeightDelta).toBeLessThan(geometry.lineHeight);
});

test("searches parsed terminal state and reports the active result", async ({ page }) => {
  await mountFixture(page);
  await expect(page.getByRole("application")).toContainText("日本語");

  await page.getByRole("button", { name: "Find in terminal output" }).click();
  await page.getByRole("searchbox", { name: "Find in terminal" }).fill("red");

  await expect(page.locator(".zd-terminal-thread-search-status")).toHaveText("1 of 1");
  await page.getByRole("button", { name: "Previous terminal match" }).click();
  await expect(page.locator(".zd-terminal-thread-search-status")).toHaveText("1 of 1");
});

test("bounds emulator scrollback while retaining the newest searchable rows", async ({ page }) => {
  const rows = Array.from({ length: 160 }, (_, index) => `line-${String(index).padStart(3, "0")}`);
  await mountFixture(page, true, rows.join("\r\n"));
  await expect(page.getByRole("application")).toContainText("line-159");
  await page.getByRole("button", { name: "Find in terminal output" }).click();
  const query = page.getByRole("searchbox", { name: "Find in terminal" });

  await query.fill("line-000");
  await expect(page.locator(".zd-terminal-thread-search-status")).toHaveText("No results");
  await query.fill("line-159");
  await expect(page.locator(".zd-terminal-thread-search-status")).toHaveText("1 of 1");
});

test("applies a theme change without restarting or discarding terminal state", async ({ page }) => {
  await mountFixture(page);
  const viewport = page.locator(".xterm-viewport");
  await expect(page.getByRole("application")).toContainText("hello 👩🏽‍💻");
  const before = await viewport.evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.evaluate(() => {
    document.documentElement.style.setProperty("--surface-canvas", "#f0e0d0");
  });

  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(240, 224, 208)");
  expect(before).not.toBe("rgb(240, 224, 208)");
  await expect(page.getByRole("application")).toContainText("hello 👩🏽‍💻");
  expect(
    await page.evaluate(() => window.terminalFixture.calls.filter((call) => call === "read")),
  ).toHaveLength(1);
});

test("accepts keyboard and paste input while copying grapheme-safe selection", async ({ page }) => {
  await mountFixture(page);
  const input = page.getByRole("textbox", { name: /Review terminal input/ });

  await input.press("Enter");
  await page.keyboard.type("abc");
  await input.press("Meta+j");
  await page.evaluate(async () => {
    window.terminalFixture.paste("日本語・貼り付け");
    window.terminalFixture.selectAll();
    await window.terminalFixture.copySelection();
  });

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.terminalFixture.calls
          .filter((call) => call.startsWith("write:"))
          .map((call) => call.slice(6))
          .join(""),
      ),
    )
    .toBe("\rabc日本語・貼り付け");
  const copied = await page.evaluate(() => window.terminalFixture.copied.join(""));
  expect(copied).toContain("👩🏽‍💻");
  expect(copied).toContain("日本語");
});

test("coalesces resize/reflow without reading or polling in the background", async ({ page }) => {
  await mountFixture(page, false);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.terminalFixture.calls.filter((call) => call.startsWith("resize:")),
      ),
    )
    .toHaveLength(1);

  await page.locator("#terminal-fixture").evaluate((host) => {
    host.style.width = "520px";
    host.style.height = "360px";
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.terminalFixture.calls.filter((call) => call.startsWith("resize:")),
      ),
    )
    .toHaveLength(2);
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.terminalFixture.calls);
  expect(calls.filter((call) => call.startsWith("resize:"))).toHaveLength(2);
  expect(calls).not.toContain("read");
  expect(calls).not.toContain("poll-exit");
});
