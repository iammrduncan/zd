import { spawn } from "node:child_process";
import console from "node:console";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE_URL = "http://127.0.0.1:1420";
const LIGHT = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench.png");
const SIDE_BY_SIDE = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-side-by-side.png");
const DARK = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-dark.png");
const DRACULA = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-dracula.png");
const READER = resolve(ROOT, "docs/user-facing-docs/assets/zd-reader.jpeg");
const COMMENTS = resolve(ROOT, "docs/user-facing-docs/assets/zd-comments.png");

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(`${BASE_URL}/dev/workbench.html`);
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for the workbench capture server");
}

async function createThread(page, projectId, name, agent, task) {
  const group = page.locator(`[data-project-id="${projectId}"]`);
  await group.locator(".zd-project-row").click();
  const threadCount = await group.locator("[data-thread-id]").count();
  await page.evaluate(
    (scene) => globalThis.workbenchDocumentationFixture.queueTerminalScene(scene),
    { agent, task },
  );
  await group.locator(`[data-thread-create-toggle="${projectId}"]`).click();
  await group.locator("[data-thread-id]").nth(threadCount).waitFor();
  await page.evaluate(
    ({ targetProjectId, targetName }) =>
      globalThis.workbenchDocumentationFixture.renameLatestThread(targetProjectId, targetName),
    { targetProjectId: projectId, targetName: name },
  );
  await group.locator("[data-thread-id]", { hasText: name }).waitFor();
}

async function prepareWorkbench(page) {
  await page.goto(`${BASE_URL}/dev/workbench.html`, { waitUntil: "networkidle" });
  await page.locator('html[data-workbench-ready="true"]').waitFor();
  await page.evaluate(() => globalThis.document.fonts.ready);

  await createThread(page, "project-zd", "Build", "codex", "Implement project navigation");
  await createThread(page, "project-zd", "Review", "shell", "Run the release checks");
  await createThread(page, "project-notes", "Docs", "claude-code", "Audit the user documentation");
  await createThread(page, "project-website", "Site", "opencode", "Refresh the release site");
  await createThread(page, "project-infra", "Release", "shell", "Package version 0.2.0");

  const project = page.locator('[data-project-id="project-zd"]');
  await project.locator(".zd-project-row").click();
  await project.locator("[data-thread-id]", { hasText: "Build" }).click();

  const src = page.locator('[data-file-path="src"]');
  if ((await src.getAttribute("aria-expanded")) !== "true") await src.click();
  await page.locator('[data-file-path="src/main.ts"]').click();
  await page.evaluate(() => {
    globalThis.workbenchDocumentationFixture.setCentreMode("overlap");
  });
  await page.locator(".cm-content").waitFor();
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
}

const server = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    colorScheme: "light",
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 900 },
  });
  await prepareWorkbench(page);

  await page.evaluate(() => {
    globalThis.workbenchDocumentationFixture.setTheme("current-light");
  });
  await page.locator('html[data-theme-name="current-light"]').waitFor();
  await page.evaluate(() => {
    globalThis.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await page.locator('[data-centre-surface="thread"]').waitFor();
  await page.locator('[data-centre-surface="file"]').waitFor();
  await page.screenshot({ path: LIGHT, animations: "disabled" });

  await page.evaluate(() => {
    globalThis.workbenchDocumentationFixture.setTheme("dark");
  });
  await page.locator('html[data-theme-name="dark"]').waitFor();
  await page.screenshot({ path: DARK, animations: "disabled" });

  await page.evaluate(() => {
    globalThis.workbenchDocumentationFixture.setTheme("dracula");
  });
  await page.locator('html[data-theme-name="dracula"]').waitFor();
  await page.screenshot({ path: DRACULA, animations: "disabled" });

  await page.evaluate(() => {
    globalThis.workbenchDocumentationFixture.setTheme("current-light");
    globalThis.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await page.locator('html[data-theme-name="current-light"]').waitFor();
  await page.locator('[data-centre-surface="thread"]').waitFor();
  await page.screenshot({ path: SIDE_BY_SIDE, animations: "disabled" });

  await page.locator('[data-file-path="README.md"]').click();
  await page.locator(".current-file-path:visible", { hasText: "README.md" }).waitFor();
  await page.locator(".zd-file-surface .cm-line:visible").first().waitFor();
  await page.screenshot({ path: READER, animations: "disabled", quality: 92 });

  const editor = page.locator(".current-file .cm-content:visible");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
  const composer = page.locator(".md-comment-composer");
  await composer.waitFor();
  await composer.getByRole("textbox", { name: "Comment" }).fill("Name the owner and due date.");
  await composer.getByRole("button", { name: "Add comment" }).click();
  await page.locator(".md-comment-tag").waitFor();
  await page.screenshot({ path: COMMENTS, animations: "disabled" });

  console.log(`captured ${LIGHT}`);
  console.log(`captured ${DARK}`);
  console.log(`captured ${DRACULA}`);
  console.log(`captured ${SIDE_BY_SIDE}`);
  console.log(`captured ${READER}`);
  console.log(`captured ${COMMENTS}`);
} catch (cause) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw cause;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
