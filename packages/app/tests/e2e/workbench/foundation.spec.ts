import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/workbench.html");
  await page.locator(".current-file .cm-editor").waitFor();
});

test("the root file surface owns editing, Find, save, and explicit Focus Mode", async ({
  page,
}) => {
  const editor = page.locator(".current-file .md-editor");
  const content = editor.locator(".cm-content");
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );

  await expect(editor).toHaveAttribute("data-language", "code");
  await expect(editor).toHaveAttribute("data-focus-mode", "false");
  await expect(content).toContainText("bootWorkbench(host, platform)");

  await content.click();
  await page.keyboard.press(`${primary}+f`);
  await expect(editor.locator(".editor-find")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor.locator(".editor-find")).toBeHidden();

  await page.keyboard.press(`${primary}+Shift+f`);
  await expect(editor).toHaveAttribute("data-focus-mode", "true");
  await page.keyboard.press(`${primary}+Shift+f`);
  await expect(editor).toHaveAttribute("data-focus-mode", "false");

  await content.press("End");
  await content.pressSequentially("\nexport const saved = true;");
  await page.keyboard.press(`${primary}+s`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-saved-text"))
    .toContain("export const saved = true;");
});

test("a file-tree selection takes the overlap centre back from an active thread", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.locator('[data-project-id="project-zd"] .zd-project-heading').hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();
  const threadSurface = page.locator('[data-centre-surface="thread"]');
  const fileSurface = page.locator('[data-centre-surface="file"]');
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();

  await page.getByRole("treeitem", { name: "README.md, Markdown file, modified" }).click();

  await expect(fileSurface).toBeVisible();
  await expect(threadSurface).toBeHidden();
  await expect(fileSurface.locator(".cm-content")).toContainText("# README.md");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(pageErrors).toEqual([]);
});

test("the active project header remains visually distinct from its active thread", async ({
  page,
}) => {
  const project = page.locator('[data-project-id="project-zd"]');
  await project.locator(".zd-project-heading").hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();

  const colours = await project.evaluate((group) => {
    const projectRow = group.querySelector<HTMLElement>('.zd-project-row[aria-current="true"]');
    const threadRow = group.querySelector<HTMLElement>('.zd-thread-row[aria-current="true"]');
    if (!projectRow || !threadRow) throw new Error("active project and thread rows are required");
    return {
      project: getComputedStyle(projectRow).backgroundColor,
      thread: getComputedStyle(threadRow).backgroundColor,
    };
  });

  expect(colours.project).not.toBe(colours.thread);
});

test("thread status and type icons align with the title without entering its labels", async ({
  page,
}) => {
  const project = page.locator('[data-project-id="project-zd"]');
  await project.locator(".zd-project-heading").hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();

  const geometry = await project.locator(".zd-thread-row").evaluate((row) => {
    const dot = row.querySelector<HTMLElement>(".zd-thread-state-dot")!.getBoundingClientRect();
    const icon = row.querySelector<HTMLElement>(".zd-thread-type-icon")!.getBoundingClientRect();
    const name = row.querySelector<HTMLElement>(".zd-thread-name")!.getBoundingClientRect();
    const secondary = row
      .querySelector<HTMLElement>(".zd-thread-secondary")!
      .getBoundingClientRect();
    return {
      iconRight: icon.right,
      labelsLeft: name.left,
      iconCentre: icon.top + icon.height / 2,
      dotCentre: dot.top + dot.height / 2,
      nameCentre: name.top + name.height / 2,
      iconBottom: icon.bottom,
      metadataTop: secondary.top,
    };
  });
  expect(geometry.labelsLeft - geometry.iconRight).toBeGreaterThanOrEqual(4);
  expect(geometry.iconCentre - geometry.nameCentre, JSON.stringify(geometry)).toBeCloseTo(2, 0);
  expect(Math.abs(geometry.dotCentre - geometry.nameCentre)).toBeLessThanOrEqual(1);
  expect(geometry.iconBottom).toBeLessThanOrEqual(geometry.metadataTop + 2);
});

test("Cmd+J restores and toggles the current thread and file after a project round trip", async ({
  page,
}) => {
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  const zd = page.locator('[data-project-id="project-zd"]');
  const notes = page.locator('[data-project-id="project-notes"]');
  const threadSurface = page.locator('[data-centre-surface="thread"]');
  const fileSurface = page.locator('[data-centre-surface="file"]');

  await zd.locator(".zd-project-heading").hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();

  const activeThread = zd.locator('[data-thread-id][aria-current="true"]');
  await activeThread.click();
  await expect(fileSurface).toBeVisible();
  await expect(threadSurface).toBeHidden();
  await activeThread.click();
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();

  await notes.locator(".zd-project-row").click();
  await expect(notes.locator(".zd-project-row")).toHaveAttribute("aria-current", "true");
  await zd.locator(".zd-project-row").click();
  await expect(zd.locator(".zd-project-row")).toHaveAttribute("aria-current", "true");
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();

  await page.keyboard.press(`${primary}+j`);
  await expect(fileSurface).toBeVisible();
  await expect(threadSurface).toBeHidden();
  await expect(fileSurface.locator(".cm-content")).toContainText("bootWorkbench(host, platform)");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement
          ?.closest('[data-centre-surface="file"]')
          ?.getAttribute("data-centre-surface"),
      ),
    )
    .toBe("file");

  await page.keyboard.press(`${primary}+j`);
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement
          ?.closest('[data-centre-surface="thread"]')
          ?.getAttribute("data-centre-surface"),
      ),
    )
    .toBe("thread");
});

test("a new disk file appears in the expanded tree without refocusing", async ({ page }) => {
  await page.locator('[data-file-path="docs"]').click();
  await page.locator('[data-file-path="docs/screenshots"]').click();
  await expect(page.locator('[data-file-path="docs/screenshots/first.png"]')).toBeVisible();

  await page.evaluate(() => {
    window.workbenchDocumentationFixture.createFile("docs/screenshots/second.png");
  });

  await expect(page.locator('[data-file-path="docs/screenshots/second.png"]')).toBeVisible();
  await expect(page.locator('[data-file-path="docs/screenshots"]')).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("the file filter has a visible close action that restores tree navigation", async ({
  page,
}) => {
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.press(`${primary}+p`);
  const filter = page.locator(".zd-file-tree-filter");
  await expect(filter.getByRole("searchbox", { name: /Filter project files/u })).toBeFocused();

  await filter.getByRole("button", { name: "Close file filter" }).click();

  await expect(filter).toBeHidden();
  await expect(page.getByRole("tree", { name: "Project files" })).toBeFocused();
});

test("pasting a screenshot into Markdown saves it before inserting a relative link", async ({
  page,
}) => {
  await page.getByRole("treeitem", { name: "README.md, Markdown file, modified" }).click();
  const content = page.locator(".current-file .cm-content");
  await expect(content).toContainText("# README.md");
  await content.click();

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(".current-file .cm-content");
    if (!target) throw new Error("fixture editor is unavailable");
    const clipboard = new DataTransfer();
    clipboard.items.add(
      new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)], "capture.png", {
        type: "image/png",
      }),
    );
    target.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }),
    );
  });

  await expect(page.locator("html")).toHaveAttribute(
    "data-saved-clipboard-image",
    /"mediaType":"image\/png".*"byteLength":8/,
  );

  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.press(`${primary}+s`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-saved-text"))
    .toContain("![Screenshot](docs/screenshots/screenshot-fixture.png)");
});

test("a dirty file survives context switches and is bold in the Files tree", async ({ page }) => {
  const notes = page.locator('[data-project-id="project-notes"]');
  await page.locator('[data-project-id="project-zd"] .zd-project-row').click();
  await page.getByRole("treeitem", { name: "README.md, Markdown file, modified" }).click();
  const content = page.locator(".current-file .cm-content");
  await expect(content).toContainText("# README.md");
  await content.click();
  await content.press("End");
  await content.pressSequentially("\nconst unsaved = true;");

  const dirty = page.locator('[data-file-path="README.md"]');
  await expect(dirty).toHaveAttribute("data-dirty", "true");
  await expect(dirty).toHaveAttribute("aria-label", /unsaved/u);
  expect(
    await dirty.locator(".zd-file-tree-name").evaluate((name) => getComputedStyle(name).fontWeight),
  ).toBe("700");

  await notes.locator(".zd-project-row").click();
  await expect(notes.locator(".zd-project-row")).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".current-file-notice:visible")).toHaveCount(0);

  await page.locator('[data-project-id="project-zd"] .zd-project-row').click();
  await expect(page.locator('[data-project-id="project-zd"] .zd-project-row')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator(".current-file .cm-content")).toContainText("const unsaved = true;");
});

test("a file context menu copies relative and full paths", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const row = page.getByRole("treeitem", { name: "README.md, Markdown file, modified" });

  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy Relative Path" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("README.md");

  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy Full Path" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("/workspace/zd/README.md");
});

test("transient Settings controls local diagnostics without crowding Threads", async ({ page }) => {
  const threads = page.locator('[data-region="threads"]');

  await expect(threads.locator('[data-project-id="project-zd"] .zd-project-row')).toContainText(
    "zd",
  );
  await expect(threads.locator('[data-diagnostic-settings="true"]')).toHaveCount(0);

  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.press(`${primary}+,`);
  const settings = page.locator(
    '[data-workbench-settings="true"] [data-diagnostic-settings="true"]',
  );
  const toggle = settings.getByRole("checkbox", { name: "Local diagnostics" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(settings.getByRole("status")).toHaveText("Recording locally.");

  await settings.getByRole("button", { name: "Reveal logs" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-diagnostics-revealed", "true");

  await page.keyboard.press(`${primary}+,`);
  await expect(page.locator("[data-workbench-settings]")).toHaveCount(0);
});

test("the command list opens from its shortcut and executes a filtered command", async ({
  page,
}) => {
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );

  await page.keyboard.press(`${primary}+Shift+p`);
  const commandList = page.getByRole("dialog", { name: "Command List" });
  const query = commandList.getByRole("textbox", { name: "Filter commands" });
  await expect(query).toBeFocused();
  await query.fill("settings");
  await commandList.getByRole("option", { name: /Settings/u }).click();

  await expect(commandList).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("Settings edits a window shortcut and restores it after reload", async ({ page }) => {
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  const editor = page.locator(".current-file .md-editor");

  await page.keyboard.press(`${primary}+,`);
  const settings = page.getByRole("dialog", { name: "Settings" });
  const binding = settings.getByRole("button", {
    name: /Change shortcut for Turn Focus Mode on or off/u,
  });
  await binding.click();
  await binding.press(`${primary}+Alt+k`);
  await settings.getByRole("button", { name: "Close Settings", exact: true }).click();

  await page.keyboard.press(`${primary}+Alt+k`);
  await expect(editor).toHaveAttribute("data-focus-mode", "true");

  await page.reload();
  await page.locator(".current-file .cm-editor").waitFor();
  await page.keyboard.press(`${primary}+Alt+k`);
  await expect(editor).toHaveAttribute("data-focus-mode", "true");
});

test("the command list selects the dark theme and restores it after reload", async ({ page }) => {
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );

  await page.keyboard.press(`${primary}+Shift+p`);
  const commandList = page.getByRole("dialog", { name: "Command List" });
  await commandList.getByRole("textbox", { name: "Filter commands" }).fill("theme dark");
  await commandList.getByRole("option", { name: /Theme: Dark/u }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme-name", "dark");
  await page.reload();
  await page.locator(".zd-workbench").waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-theme-name", "dark");
});
