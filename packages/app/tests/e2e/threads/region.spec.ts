import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    threadFixture: {
      calls: string[];
      intervalCount: number;
      mountDurationMs: number;
      mountProjectCreator(): void;
      setVisibility(visibility: import("../../../src/workbench/state").ThreadsVisibility): void;
    };
  }
}

async function mountFixture(page: Page, threadCount = 3): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (count) => {
    const modulePath = "/src/threads/index.ts";
    const { ThreadsController, mountProjectThreads, mountThreadsRegion } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import("../../../src/threads");
    type Snapshot = import("../../../src/threads").ThreadWorkbenchSnapshot;
    type Record = import("../../../src/threads").ThreadRecord;

    const calls: string[] = [];
    const listeners = new Set<(snapshot: Snapshot) => void>();
    const createThread = (index: number): Record => ({
      id: `thread-${index}`,
      projectId: index % 2 === 0 ? "alpha" : "beta",
      worktree: {
        id: index % 2 === 0 ? "alpha-root" : "beta-feature",
        label: index % 2 === 0 ? "main" : "feature/browser",
        root: index % 2 === 0 ? "/workspace/alpha" : "/workspace/beta-feature",
        kind: index % 2 === 0 ? "project-root" : "worktree",
        availability: "available",
      },
      name: `Thread ${index}`,
      order: Math.floor(index / 2),
      type: { kind: "terminal", agent: index === 0 ? "codex" : "shell" },
      lifecycle: index === 0 ? "waiting" : index === 1 ? "busy" : "idle",
      lifecycleSource: index < 2 ? "supported-agent" : "process",
      lifecycleRevision: 1,
      attention: { unread: index === 0, version: index === 0 ? 1 : 0 },
      backing: {
        kind: "terminal",
        referenceId: `terminal-${index}`,
        availability: "ready",
      },
      recovery: null,
    });
    let snapshot: Snapshot = {
      projects: [
        { id: "alpha", name: "Alpha", order: 0, availability: "available" },
        { id: "beta", name: "Beta", order: 1, availability: "available" },
      ],
      threads: Array.from({ length: count }, (_, index) => createThread(index)),
      activeThreadId: "thread-0",
      visibility: "full",
    };
    const publish = () => listeners.forEach((listener) => listener(snapshot));
    const adapter: import("../../../src/threads").ThreadWorkbenchAdapter = {
      snapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      createThread: async (request) => {
        calls.push(`create:${JSON.stringify(request)}`);
        return { status: "committed" };
      },
      renameThread: async (threadId, name) => {
        calls.push(`rename:${threadId}:${name}`);
        return { status: "committed" };
      },
      reorderThreads: async () => ({ status: "committed" }),
      activateThread: async (threadId) => {
        calls.push(`activate:${threadId}`);
        snapshot = { ...snapshot, activeThreadId: threadId };
        publish();
        return { status: "committed" };
      },
      closeThread: async (threadId) => {
        calls.push(`close:${threadId}`);
        return { status: "committed" };
      },
      removeThread: async (threadId) => {
        calls.push(`remove:${threadId}`);
        return { status: "committed" };
      },
      recoverThread: async () => ({ status: "committed" }),
      setThreadsVisibility: async (visibility) => {
        snapshot = { ...snapshot, visibility };
        publish();
        return { status: "committed" };
      },
      acknowledgeAttention: async () => ({ status: "committed" }),
    };

    let intervalCount = 0;
    const originalSetInterval = window.setInterval;
    window.setInterval = ((...arguments_: Parameters<typeof window.setInterval>) => {
      intervalCount += 1;
      return originalSetInterval(...arguments_);
    }) as typeof window.setInterval;
    const host = document.createElement("aside");
    host.id = "thread-fixture";
    document.body.replaceChildren(host);
    const started = performance.now();
    const controller = new ThreadsController(adapter);
    const unmount = mountThreadsRegion(host, controller);
    const mountDurationMs = performance.now() - started;
    window.setInterval = originalSetInterval;

    window.threadFixture = {
      calls,
      intervalCount,
      mountDurationMs,
      mountProjectCreator() {
        unmount();
        const projectHost = document.createElement("aside");
        projectHost.id = "thread-fixture";
        document.body.replaceChildren(projectHost);
        mountProjectThreads(projectHost, controller, "alpha", {
          projectName: "Alpha",
          workspaces: [
            {
              id: "alpha-root",
              label: "project root",
              root: "/workspace/alpha",
              kind: "project-root",
              availability: "available",
            },
          ],
        });
      },
      setVisibility(visibility) {
        snapshot = { ...snapshot, visibility };
        publish();
      },
    };
  }, threadCount);
}

test("renders a dense accessible project/thread hierarchy", async ({ page }) => {
  await mountFixture(page);

  await expect(page.locator("[data-thread-project]")).toHaveCount(2);
  const selected = page.locator('[data-thread-id="thread-0"]');
  await expect(selected).toHaveAttribute("aria-current", "true");
  await expect(selected).toHaveAttribute("aria-label", /codex, waiting.*attention required/);
  await expect(selected).toContainText("waiting");
  await expect(page.locator('[data-thread-id="thread-1"]')).toContainText("terminal · busy");

  await page.mouse.move(800, 400);
  const metrics = await selected.evaluate((row) => ({
    height: row.getBoundingClientRect().height,
    family: getComputedStyle(row).fontFamily,
    background: getComputedStyle(row).backgroundColor,
    dot: getComputedStyle(row.querySelector(".zd-thread-state-dot")!).backgroundColor,
    nameTop: row.querySelector(".zd-thread-name")!.getBoundingClientRect().top,
    secondaryTop: row.querySelector(".zd-thread-secondary")!.getBoundingClientRect().top,
    actionsOpacity: getComputedStyle(
      row.closest(".zd-thread-item")!.querySelector(".zd-thread-actions")!,
    ).opacity,
  }));
  expect(metrics.height).toBeGreaterThanOrEqual(30);
  expect(metrics.height).toBeLessThanOrEqual(44);
  expect(metrics.family).toContain("iA Writer Mono");
  expect(metrics.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(metrics.dot).not.toBe(metrics.background);
  expect(metrics.secondaryTop).toBeGreaterThan(metrics.nameTop);
  expect(metrics.actionsOpacity).toBe("0");

  await selected.hover();
  await expect(selected.locator("xpath=..").locator(".zd-thread-actions")).toHaveCSS(
    "opacity",
    "1",
  );
});

test("thread context settings choose the secondary line", async ({ page }) => {
  await mountFixture(page);
  const thread = page.locator('[data-thread-id="thread-1"]');

  await thread.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Thread 1 thread settings" });
  await expect(menu).toContainText("Second line");
  await expect(page.getByRole("menuitemradio", { name: "App running" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("menuitemradio", { name: "Branch / worktree" }).click();

  await expect(thread.locator(".zd-thread-secondary")).toHaveText("feature/browser");
  await expect(page.locator('[data-thread-id="thread-0"] .zd-thread-secondary')).toHaveText("main");
  await expect(menu).toHaveCount(0);
});

test("pointer and keyboard activation use the same transaction request", async ({ page }) => {
  await mountFixture(page);
  const first = page.locator('[data-thread-id="thread-0"]');
  const second = page.locator('[data-thread-id="thread-1"]');

  await second.click();
  await first.focus();
  await first.press("End");
  await expect(second).toBeFocused();
  await second.press("Enter");

  await expect
    .poll(() => page.evaluate(() => window.threadFixture.calls))
    .toEqual(["activate:thread-1", "activate:thread-1"]);
});

test("compact controls create directly, rename, close, and remove through the adapter", async ({
  page,
}) => {
  await mountFixture(page);
  await page.locator('[data-thread-id="thread-0"]').hover();
  await page.getByRole("button", { name: "Rename Thread 0" }).click();
  const rename = page.getByRole("textbox", { name: "New name for Thread 0" });
  await rename.fill("Renamed thread");
  await rename.press("Enter");
  await page.getByRole("button", { name: "Close Thread 0" }).click();
  await page.locator('[data-thread-id="thread-2"]').hover();
  await page.getByRole("button", { name: "Remove Thread 2" }).click();

  await page.evaluate(() => window.threadFixture.mountProjectCreator());
  await page.getByRole("button", { name: "New terminal in Alpha" }).click();

  await expect
    .poll(() => page.evaluate(() => window.threadFixture.calls))
    .toEqual([
      "rename:thread-0:Renamed thread",
      "close:thread-0",
      "remove:thread-2",
      'create:{"name":"Terminal","type":{"kind":"terminal","agent":"shell"},"workspace":{"kind":"project-root","projectId":"alpha","worktreeId":"alpha-root"}}',
    ]);
});

test("collapsed and hidden modes preserve selection without retaining hidden focus", async ({
  page,
}) => {
  await mountFixture(page);
  const selected = page.locator('[data-thread-id="thread-0"]');
  await selected.focus();

  await page.evaluate(() => window.threadFixture.setVisibility("collapsed"));
  await expect(page.locator("[data-thread-region-mode]")).toHaveAttribute(
    "data-thread-region-mode",
    "collapsed",
  );
  await expect(page.locator('[data-thread-id="thread-0"]')).toHaveAttribute("aria-current", "true");

  await page.evaluate(() => window.threadFixture.setVisibility("hidden"));
  await expect(page.locator("[data-thread-region-mode]")).toBeHidden();
  await expect(page.locator("body")).toBeFocused();

  await page.evaluate(() => window.threadFixture.setVisibility("full"));
  await expect(page.locator('[data-thread-id="thread-0"]')).toHaveAttribute("aria-current", "true");
});

test("a measured large hierarchy remains one idle, stable render", async ({ page }) => {
  await mountFixture(page, 1_000);

  await expect(page.locator("[data-thread-id]")).toHaveCount(1_000);
  const evidence = await page.evaluate(() => ({
    intervalCount: window.threadFixture.intervalCount,
    mountDurationMs: window.threadFixture.mountDurationMs,
  }));
  expect(evidence.intervalCount).toBe(0);
  expect(evidence.mountDurationMs).toBeLessThan(1_000);
});
