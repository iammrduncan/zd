import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE_URL = "http://127.0.0.1:1420";
const OVERLAP = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench.png");
const SIDE_BY_SIDE = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-side-by-side.png");

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/dev/workbench.html`);
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Timed out waiting for the workbench capture server");
}

async function createThread(page, projectId, name, agent) {
  const group = page.locator(`[data-project-id="${projectId}"]`);
  await group.locator(".zd-project-row").click();
  await group.locator(`[data-thread-create-toggle="${projectId}"]`).click();
  const form = group.locator(`[data-thread-create="${projectId}"]`);
  await form.locator('input[name="thread-name"]').fill(name);
  await form.locator('select[name="thread-agent"]').selectOption(agent);
  await form.getByRole("button", { name: "Create", exact: true }).click();
  await group.locator("[data-thread-id]", { hasText: name }).waitFor();
}

async function prepareWorkbench(page) {
  await page.goto(`${BASE_URL}/dev/workbench.html`, { waitUntil: "networkidle" });
  await page.locator('html[data-workbench-ready="true"]').waitFor();
  await page.evaluate(() => document.fonts.ready);

  await createThread(page, "project-zd", "Build", "codex");
  await createThread(page, "project-zd", "Review", "shell");
  await createThread(page, "project-notes", "Notes", "claude-code");
  await createThread(page, "project-website", "Site", "opencode");
  await createThread(page, "project-infra", "Release", "shell");

  const project = page.locator('[data-project-id="project-zd"]');
  await project.locator(".zd-project-row").click();
  await project.locator("[data-thread-id]", { hasText: "Build" }).click();

  const src = page.locator('[data-file-path="src"]');
  if ((await src.getAttribute("aria-expanded")) !== "true") await src.click();
  await page.locator('[data-file-path="src/main.ts"]').click();
  await page.evaluate(() => {
    window.workbenchDocumentationFixture.setCentreMode("overlap");
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
    window.workbenchDocumentationFixture.setCentreMode("overlap");
  });
  await page.locator('[data-centre-surface="file"]').waitFor();
  await page.screenshot({ path: OVERLAP, animations: "disabled" });

  await page.evaluate(() => {
    window.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await page.locator('[data-centre-surface="thread"]').waitFor();
  await page.screenshot({ path: SIDE_BY_SIDE, animations: "disabled" });

  console.log(`captured ${OVERLAP}`);
  console.log(`captured ${SIDE_BY_SIDE}`);
} catch (cause) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw cause;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
