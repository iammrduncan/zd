import { expect, test } from "./host.fixture";

test("opens a real host file read-only and refuses packet-zero exclusions", async ({
  page,
  servedHost,
}) => {
  const requestedUrls: string[] = [];
  const consoleMessages: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));
  page.on("console", (message) => consoleMessages.push(message.text()));

  await page.goto(servedHost.url);
  await expect(page.getByRole("heading", { name: "Connect to zd" })).toBeVisible();
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();

  const workbench = page.locator(".zd-workbench");
  await expect(workbench).toBeVisible();
  expect(page.url()).not.toContain(servedHost.secret);

  const files = page.getByRole("complementary", { name: "Files and Changes" });
  await expect(files.locator(".zd-file-tree-notice")).toContainText(
    "Automatic file-tree updates are unavailable",
  );
  await files.locator('[data-file-path="notes.md"]').click();

  const buffer = page.locator('.editor-buffer[data-buffer-kind="read-only"]');
  await expect(buffer).toBeVisible();
  await expect(buffer).toHaveAccessibleName("notes.md, Markdown, read-only");
  await expect(buffer).toContainText("Opened through the real Rust host.");
  await expect(buffer.locator(".md-editor")).toHaveAttribute("data-editable", "false");
  await expect(buffer.locator(".cm-content")).toHaveAttribute("contenteditable", "false");

  await buffer.locator(".cm-content").click();
  await page.keyboard.type("should not be written");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(buffer).toContainText("Served workbenches are read-only. Editing is unavailable.");
  await expect(buffer).not.toContainText("should not be written");
  await expect(servedHost.readFixtureFile()).resolves.toBe(servedHost.fileText);
  const draftKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("zd.fileDraft.v1:")),
  );
  expect(draftKeys).toEqual([]);

  await files.locator('[data-file-path="docs"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "New File…" }).click();
  const create = page.getByRole("dialog", { name: "New file in docs" });
  await create.getByRole("textbox", { name: "Name" }).fill("refused.md");
  await create.getByRole("button", { name: "Create" }).click();
  await expect(create.getByRole("status")).toContainText("read-only served workbench");
  await expect(servedHost.readFixtureDocs()).resolves.toEqual(["inside.md"]);

  await files.getByRole("tab", { name: "CHANGES" }).click();
  await expect(files.getByRole("region", { name: "Changes" })).toContainText(
    "Git inspection is unavailable",
  );

  await page.keyboard.press("ControlOrMeta+j");
  const terminal = page.locator("[data-project-terminal]");
  await expect(terminal).toBeVisible();
  await expect(terminal).toContainText("Terminal input is unavailable.");

  await expect(page.getByRole("status", { name: "Served workbench limits" })).toContainText(
    "project picker, recent workspaces, and other project roots are unavailable",
  );
  expect(await page.evaluate(() => fetch("/notes.md").then((response) => response.status))).toBe(
    404,
  );
  const browserState = await page.evaluate(() => ({
    cookies: document.cookie,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(JSON.stringify(browserState)).not.toContain(servedHost.secret);
  expect(JSON.stringify(await page.context().cookies())).not.toContain(servedHost.secret);
  expect(requestedUrls.length).toBeGreaterThan(0);
  expect(requestedUrls.every((url) => !url.includes(servedHost.secret))).toBe(true);
  expect(consoleMessages.every((message) => !message.includes(servedHost.secret))).toBe(true);
});
