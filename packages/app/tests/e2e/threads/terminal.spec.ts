import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    terminalFixture: {
      calls: string[];
      search(query: string): number;
    };
  }
}

async function mountFixture(page: Page, refresh = true): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (readOutput) => {
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
    const contents = "hello 👩🏽‍💻\n<script>unsafe()</script>\n日本語";
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
    mountTerminalThreadSurface(
      host,
      terminal,
      { threadName: "Review", projectName: "Alpha", worktreeLabel: "feature/review" },
      { applicationOwnsKey: (event) => event.metaKey && event.key.toLowerCase() === "j" },
    );
    if (readOutput) await terminal.refresh();
    window.terminalFixture = { calls, search: (query) => terminal.search(query).length };
  }, refresh);
}

test("renders Unicode and untrusted output as selectable themed text", async ({ page }) => {
  await mountFixture(page);

  const output = page.locator('[role="log"]');
  await expect(output).toContainText("hello 👩🏽‍💻");
  await expect(output).toContainText("<script>unsafe()</script>");
  await expect(page.locator("#terminal-fixture script")).toHaveCount(0);
  await expect(output).toHaveAttribute("aria-label", /Review terminal output.*Alpha/);
  await expect(page.locator("textarea")).toHaveAttribute("aria-label", /Review terminal input/);

  const metrics = await output.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const style = getComputedStyle(element);
    return {
      selected: selection?.toString(),
      family: style.fontFamily,
      foreground: style.color,
      background: style.backgroundColor,
    };
  });
  expect(metrics.selected).toContain("👩🏽‍💻");
  expect(metrics.family).toContain("iA Writer Mono");
  expect(metrics.foreground).not.toBe(metrics.background);
  await expect.poll(() => page.evaluate(() => window.terminalFixture.search("日本語"))).toBe(1);
});

test("accepts text and terminal keys while preserving root-owned shortcuts", async ({ page }) => {
  await mountFixture(page);
  const input = page.locator("textarea");

  await input.press("Enter");
  await input.fill("日本語");
  await input.press("Meta+j");

  await expect
    .poll(() =>
      page.evaluate(() => window.terminalFixture.calls.filter((call) => call.startsWith("write:"))),
    )
    .toEqual(["write:\r", "write:日本語"]);
});

test("coalesces resize/reflow signals without reading or polling in the background", async ({
  page,
}) => {
  await mountFixture(page, false);
  await page.waitForTimeout(100);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.terminalFixture.calls.filter((call) => call.startsWith("resize:")),
      ),
    )
    .not.toHaveLength(0);

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
  const calls = await page.evaluate(() => window.terminalFixture.calls);
  expect(calls).not.toContain("read");
  expect(calls).not.toContain("poll-exit");
});
