import { expect, test, type Page } from "@playwright/test";

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

test("renders a dense horizontally and vertically scrollable virtual tree", async ({ page }) => {
  await mountFixture(page);
  const viewport = page.locator("[data-file-tree-viewport]");
  const visibleRows = page.locator('[role="treeitem"]');

  await expect(visibleRows).not.toHaveCount(0);
  expect(await visibleRows.count()).toBeLessThan(40);
  const metrics = await page.locator('[data-file-path="src"]').evaluate((row) => ({
    height: row.getBoundingClientRect().height,
    family: getComputedStyle(row).fontFamily,
  }));
  expect(metrics.height).toBe(19);
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
  await src.click();
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
