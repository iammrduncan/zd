import { expect, test, type Locator, type Page } from "@playwright/test";

declare global {
  interface Window {
    fileTreeFixture: {
      readonly calls: string[];
      readonly initialRenderMs: number;
      readonly controller: import("../../../src/files").FileTreeController;
      replaceOnDisk(): Promise<void>;
    };
  }
}

async function mountFixture(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async () => {
    const modulePath = "/src/files/index.ts";
    const { FileTreeController, mountFileTree } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import("../../../src/files");
    type NativeEntry = import("../../../src/files").NativeFileTreeEntry;
    const scope = { projectId: "alpha", worktreeId: "alpha-root" };
    const file = (relativePath: string): NativeEntry => {
      const slash = relativePath.lastIndexOf("/");
      return {
        relativePath,
        parentPath: slash < 0 ? null : relativePath.slice(0, slash),
        name: relativePath.slice(slash + 1),
        kind: "file",
        ignored: false,
        byteLength: 12,
        modified: 1,
      };
    };
    const directory = (relativePath: string): NativeEntry => ({
      ...file(relativePath),
      kind: "directory",
      byteLength: null,
    });
    let revision = "one";
    let entries: readonly NativeEntry[] = [
      directory("src"),
      file("src/main.ts"),
      file("src/theme.css"),
      file(`${"a".repeat(180)}.md`),
      ...Array.from({ length: 10_000 }, (_, index) =>
        file(`file-${index.toString().padStart(5, "0")}.txt`),
      ),
    ];
    const calls: string[] = [];
    const adapter: import("../../../src/files").FileTreeAdapter = {
      snapshot: async () => ({
        ...scope,
        status: "ready",
        revision,
        entries,
        truncated: false,
        ignoredTruncated: false,
        unreadableDirectories: 0,
        elapsedMicros: 120,
      }),
      watch: () => () => {},
    };
    const controller = new FileTreeController(adapter, {
      activateFile: async (resource) => {
        calls.push(`activate:${resource.relativePath}`);
        return { status: "committed" };
      },
    });
    const host = document.createElement("aside");
    host.id = "file-tree-fixture";
    host.style.width = "280px";
    host.style.height = "320px";
    document.body.replaceChildren(host);
    const started = performance.now();
    mountFileTree(host, controller);
    await controller.activate(scope, "file-00000.txt");
    controller.reconcileGit(
      new Map([
        ["file-00000.txt", "modified"],
        ["file-00001.txt", "added"],
        ["file-00002.txt", "ignored"],
        ["removed.md", "deleted"],
      ]),
    );
    window.fileTreeFixture = {
      calls,
      controller,
      initialRenderMs: performance.now() - started,
      replaceOnDisk: async () => {
        revision = "two";
        entries = [...entries, file("src/new-file.ts")];
        await controller.refresh("disk");
      },
    };
  });
}

async function mouseDrag(page: Page, source: Locator, destination: Locator): Promise<void> {
  await expect(source).toBeVisible();
  await expect(destination).toBeVisible();
  let from: Awaited<ReturnType<Locator["boundingBox"]>> = null;
  let to: Awaited<ReturnType<Locator["boundingBox"]>> = null;
  await expect
    .poll(
      async () => {
        [from, to] = await Promise.all([source.boundingBox(), destination.boundingBox()]);
        return Boolean(from && to);
      },
      { message: "the virtualized source and destination rows never had geometry together" },
    )
    .toBe(true);

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2, {
    steps: 4,
  });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("renders a dense horizontally and vertically scrollable virtual tree", async ({ page }) => {
  await mountFixture(page);
  const viewport = page.locator("[data-file-tree-viewport]");
  const visibleRows = page.locator('[role="treeitem"]');

  await expect(visibleRows).not.toHaveCount(0);
  expect(await visibleRows.count()).toBeLessThan(40);
  const metrics = await page.locator('[data-file-path="src"]').evaluate((row) => ({
    height: row.getBoundingClientRect().height,
    hitHeight: getComputedStyle(row, "::before").height,
    family: getComputedStyle(row).fontFamily,
  }));
  expect(metrics.height).toBe(19);
  expect(metrics.hitHeight).toBe("24px");
  expect(metrics.family).toContain("iA Writer Mono");
  const scrolling = await viewport.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    overflowY: getComputedStyle(element).overflowY,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(scrolling.overflowX).toBe("auto");
  expect(scrolling.overflowY).toBe("auto");
  expect(scrolling.scrollWidth).toBeGreaterThan(scrolling.clientWidth);
  expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
  expect(await page.evaluate(() => window.fileTreeFixture.initialRenderMs)).toBeLessThan(2_000);
});

test("offers create, rename, copy-path, and confirmed Trash actions for folders", async ({
  page,
}) => {
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();
  const files = page.getByRole("complementary", { name: "Files and Changes" });

  await files.locator('[data-file-path="docs"]').click({ button: "right" });
  const menu = page.getByRole("menu", { name: "docs file actions" });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "New File…",
    "New Folder…",
    "Cut",
    "Copy",
    "Rename…",
    "Copy Relative Path",
    "Copy Full Path",
    "Move to Trash…",
  ]);
  await menu.getByRole("menuitem", { name: "New Folder…" }).click();
  const create = page.getByRole("dialog", { name: "New folder in docs" });
  await create.getByRole("textbox", { name: "Name" }).fill("drafts");
  await create.getByRole("button", { name: "Create" }).click();
  await expect(files.locator('[data-file-path="docs/drafts"]')).toBeVisible();

  await files.locator('[data-file-path="docs/drafts"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename drafts" });
  await rename.getByRole("textbox", { name: "New name" }).fill("notes");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(files.locator('[data-file-path="docs/notes"]')).toBeVisible();

  await files.locator('[data-file-path="docs/notes"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move to Trash…" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Move notes to Trash" });
  await expect(confirmation).toContainText("docs/notes");
  await confirmation.getByRole("button", { name: "Move to Trash" }).click();
  await expect(files.locator('[data-file-path="docs/notes"]')).toHaveCount(0);
});

test("multi-select copy/paste and internal drag/drop operate on the real hierarchy", async ({
  page,
}) => {
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();
  const files = page.getByRole("complementary", { name: "Files and Changes" });

  await files.locator('[data-file-path="docs"]').click();
  await files.locator('[data-file-path="docs/screenshots"]').click();
  await files.locator('[data-file-path="docs/user-facing-docs"]').click();
  await mouseDrag(
    page,
    files.locator('[data-file-path="docs/screenshots/first.png"]'),
    files.locator('[data-file-path="docs/user-facing-docs"]'),
  );
  const screenshot = files.locator('[data-file-path="docs/user-facing-docs/first.png"]');
  const readme = files.locator('[data-file-path="docs/user-facing-docs/README.md"]');
  await expect(screenshot).toBeVisible();
  await expect(files.locator('[data-file-path="docs/screenshots/first.png"]')).toHaveCount(0);
  await screenshot.click();
  await readme.click({ modifiers: ["ControlOrMeta"] });
  await expect(screenshot).toHaveAttribute("aria-selected", "true");
  await expect(readme).toHaveAttribute("aria-selected", "true");
  await readme.press("ControlOrMeta+c");

  await files.locator('[data-file-path="packages"]').click();
  await files.locator('[data-file-path="packages/app"]').click();
  await files.locator('[data-file-path="packages/app"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Paste" }).click();
  await expect(files.locator('[data-file-path="packages/app/first.png"]')).toBeVisible();
  await expect(files.locator('[data-file-path="packages/app/README.md"]')).toBeVisible();
});

test("a real mouse drag moves a file into the folder under the pointer", async ({ page }) => {
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();
  const files = page.getByRole("complementary", { name: "Files and Changes" });

  await files.locator('[data-file-path="docs"]').click();
  await files.locator('[data-file-path="docs/screenshots"]').click();
  await files.locator('[data-file-path="docs/user-facing-docs"]').click();
  const source = files.locator('[data-file-path="docs/screenshots/first.png"]');
  const destination = files.locator('[data-file-path="docs/user-facing-docs"]');
  // macOS's webview does not reliably start native HTML drag-and-drop for a button.
  await files.locator("[data-file-tree-viewport]").evaluate((viewport) => {
    viewport.addEventListener(
      "dragstart",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
  });
  await mouseDrag(page, source, destination);

  await expect(files.locator('[data-file-path="docs/user-facing-docs/first.png"]')).toBeVisible();
  await expect(files.locator('[data-file-path="docs/screenshots/first.png"]')).toHaveCount(0);
});

test("exposes file type and Git state without a status-letter column", async ({ page }) => {
  await mountFixture(page);
  const modified = page.locator('[data-file-path="file-00000.txt"]');
  const added = page.locator('[data-file-path="file-00001.txt"]');

  await expect(modified).toHaveAttribute("aria-label", "file-00000.txt, text file, modified");
  await expect(modified).toHaveAttribute("aria-current", "page");
  await expect(modified).toHaveAttribute("data-git-state", "changed");
  await expect(added).toHaveAttribute("data-git-state", "added");
  expect(await modified.textContent()).not.toMatch(/\bM\b/u);
  expect(await added.textContent()).not.toMatch(/\bA\b/u);
  expect(await modified.evaluate((row) => getComputedStyle(row).color)).not.toBe(
    await page.evaluate(() => getComputedStyle(document.documentElement).color),
  );
  const icon = modified.locator(".zd-file-tree-icon");
  await expect(icon).toHaveClass(/\bcodicon-note\b/u);
  expect(await icon.textContent()).toBe("");
  expect(await icon.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    "codicon",
  );
  expect(await icon.evaluate((element) => getComputedStyle(element, "::before").content)).not.toBe(
    "none",
  );
});

test("keyboard disclosure reaches nested files and activates through one root action", async ({
  page,
}) => {
  await mountFixture(page);
  const src = page.locator('[data-file-path="src"]');
  await src.focus();
  await src.press("ArrowRight");
  await src.press("ArrowRight");
  const main = page.locator('[data-file-path="src/main.ts"]');
  await expect(main).toBeVisible();
  await main.press("Enter");

  await expect
    .poll(() => page.evaluate(() => window.fileTreeFixture.calls))
    .toEqual(["activate:src/main.ts"]);
  await expect(src).toHaveAttribute("aria-expanded", "true");
  await expect(main.locator(".zd-file-tree-guides > span")).toHaveCount(1);
});

test("selecting a folder toggles it open and closed", async ({ page }) => {
  await mountFixture(page);
  const src = page.locator('[data-file-path="src"]');

  await src.locator(".zd-file-tree-disclosure").click();
  await expect(src).toHaveAttribute("aria-expanded", "true");

  await src.locator(".zd-file-tree-name").click();
  await expect(src).toHaveAttribute("aria-expanded", "false");
  await expect(src).toHaveAttribute("aria-selected", "true");

  await src.locator(".zd-file-tree-name").click();
  await expect(src).toHaveAttribute("aria-expanded", "true");
});

test("filtering by category restores selection and both scroll axes when cleared", async ({
  page,
}) => {
  await mountFixture(page);
  const viewport = page.locator("[data-file-tree-viewport]");
  const before = await viewport.evaluate((element) => {
    element.scrollTo({ top: 190, left: 30 });
    element.dispatchEvent(new Event("scroll"));
    return { top: element.scrollTop, left: element.scrollLeft };
  });
  await page.evaluate(() => window.fileTreeFixture.controller.summonFilter());
  const filter = page.getByRole("searchbox", { name: /Filter project files/u });
  await filter.fill("type:code");
  await expect(page.locator(".zd-file-tree-filter-count")).toHaveText("2 results");
  await expect(page.locator('[data-file-path="src/main.ts"]')).toBeVisible();

  await filter.press("Escape");

  await expect(filter).toBeHidden();
  expect(
    await viewport.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft })),
  ).toEqual(before);
});

test("bounded disk refresh preserves expansion, selection, and active file", async ({ page }) => {
  await mountFixture(page);
  const src = page.locator('[data-file-path="src"]');
  await src.locator(".zd-file-tree-disclosure").click();
  await page.evaluate(() => window.fileTreeFixture.controller.select("src/main.ts"));
  await page.evaluate(() => window.fileTreeFixture.replaceOnDisk());

  await expect(src).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-file-path="src/new-file.ts"]')).toBeVisible();
  await expect(page.locator('[data-file-path="src/main.ts"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('[data-file-path="file-00000.txt"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("records bounded large-tree work and stays idle between signals", async ({ page }) => {
  await mountFixture(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const readMetric = async (name: string): Promise<number> => {
    const result = await session.send("Performance.getMetrics");
    return result.metrics.find((metric) => metric.name === name)?.value ?? 0;
  };
  const taskBefore = await readMetric("TaskDuration");
  await page.waitForTimeout(300);
  const idleTaskMs = ((await readMetric("TaskDuration")) - taskBefore) * 1_000;
  const heapBytes = await readMetric("JSHeapUsedSize");
  const timings = await page.evaluate(async () => {
    const controller = window.fileTreeFixture.controller;
    const filterStarted = performance.now();
    controller.summonFilter();
    controller.setFilter("type:text");
    const filterMs = performance.now() - filterStarted;
    controller.dismissFilter();
    const expandStarted = performance.now();
    controller.expand("src");
    const expandMs = performance.now() - expandStarted;
    const refreshStarted = performance.now();
    await controller.refresh("manual");
    return {
      initialRenderMs: window.fileTreeFixture.initialRenderMs,
      filterMs,
      expandMs,
      refreshMs: performance.now() - refreshStarted,
    };
  });

  console.info("file-tree browser fixture", {
    entries: 10_004,
    liveRows: await page.locator('[role="treeitem"]').count(),
    heapBytes,
    idleTaskMs,
    ...timings,
  });
  expect(timings.initialRenderMs).toBeLessThan(2_000);
  expect(timings.filterMs).toBeLessThan(500);
  expect(timings.expandMs).toBeLessThan(100);
  expect(timings.refreshMs).toBeLessThan(1_000);
  expect(heapBytes).toBeLessThan(256 * 1024 * 1024);
  expect(idleTaskMs).toBeLessThan(150);
  expect(await page.locator('[role="treeitem"]').count()).toBeLessThan(40);
});
