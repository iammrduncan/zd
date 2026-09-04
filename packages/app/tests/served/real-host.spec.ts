import type { Locator, Page } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { disposeServedTerminals, expect, readTreeText, test } from "./host.fixture";

interface SeededState {
  readonly projectId: string;
  readonly worktreeId: string;
}

interface TerminalWriteCapture {
  checkpoint(sessionId: string): number;
  textAfter(sessionId: string, checkpoint: number): string;
}

async function clickWithPointerJitter(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  let bounds = await target.boundingBox();
  for (let attempt = 0; bounds === null && attempt < 100; attempt += 1) {
    await page.waitForTimeout(50);
    bounds = await target.boundingBox();
  }
  if (bounds === null) throw new Error("the file-tree row has no pointer geometry");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y);
  await page.mouse.up();
}

function captureTerminalWrites(page: Page): TerminalWriteCapture {
  const writes = new Map<string, Buffer[]>();
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string") return;
      let message: unknown;
      try {
        message = JSON.parse(payload);
      } catch {
        return;
      }
      if (typeof message !== "object" || message === null || !("method" in message)) return;
      if (message.method !== "terminal.write" || !("params" in message)) return;
      const params = message.params;
      if (typeof params !== "object" || params === null) return;
      if (!("session" in params) || !("bytesBase64" in params)) return;
      const session = params.session;
      if (
        typeof session !== "object" ||
        session === null ||
        !("sessionId" in session) ||
        typeof session.sessionId !== "string" ||
        typeof params.bytesBase64 !== "string"
      ) {
        return;
      }
      const chunks = writes.get(session.sessionId) ?? [];
      chunks.push(Buffer.from(params.bytesBase64, "base64"));
      writes.set(session.sessionId, chunks);
    });
  });
  const contents = (sessionId: string): Buffer => Buffer.concat(writes.get(sessionId) ?? []);
  return {
    checkpoint: (sessionId) => contents(sessionId).length,
    textAfter: (sessionId, checkpoint) => contents(sessionId).subarray(checkpoint).toString("utf8"),
  };
}

async function openNestedFixtureFile(page: Page): Promise<void> {
  const files = page.getByRole("complementary", { name: "Files and Changes" });
  const filesTab = files.getByRole("tab", { name: "FILES" });
  if ((await filesTab.getAttribute("aria-selected")) !== "true") await filesTab.click();
  await expect(filesTab).toHaveAttribute("aria-selected", "true");
  const docs = files.locator('[data-file-path="docs"]');
  await docs.click();
  await expect(docs).toHaveAttribute("aria-expanded", "true");
  await files.locator('[data-file-path="docs/inside.md"]').click();
  await expect(page.locator('.editor-buffer[data-buffer-kind="editable"]')).toContainText("inside");
}

test("tolerates a durable record replaced while test evidence is read", async () => {
  const root = await mkdtemp(join(tmpdir(), "zd-served-tree-read-"));
  const record = join(root, "record.json");
  try {
    await writeFile(record, '{"revision":1}', "utf8");
    const contents = await readTreeText(root, async (path) => {
      await rm(path);
      return readFile(path, "utf8");
    });

    expect(contents).toBe("");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("gives served form fields stable browser identities", async ({ page, servedHost }) => {
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();

  const unnamedFields = page.locator(":is(input, select, textarea):not([id]):not([name])");
  expect(
    await unnamedFields.evaluateAll((fields) =>
      fields.map((field) => ({
        tagName: field.tagName,
        className: field.className,
        ariaLabel: field.getAttribute("aria-label"),
        type: field.getAttribute("type"),
      })),
    ),
  ).toEqual([]);

  await page.getByRole("button", { name: "Open project folder" }).click();
  await expect(page.getByRole("dialog", { name: "Open remote folder" })).toBeVisible();
  expect(
    await unnamedFields.evaluateAll((fields) =>
      fields.map((field) => ({
        tagName: field.tagName,
        className: field.className,
        ariaLabel: field.getAttribute("aria-label"),
        type: field.getAttribute("type"),
      })),
    ),
  ).toEqual([]);
  await page
    .getByRole("dialog", { name: "Open remote folder" })
    .getByRole("button", { name: "Cancel" })
    .click();

  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator("[data-project-terminal]")).toBeVisible();
  expect(
    await unnamedFields.evaluateAll((fields) =>
      fields.map((field) => ({
        tagName: field.tagName,
        className: field.className,
        ariaLabel: field.getAttribute("aria-label"),
        type: field.getAttribute("type"),
      })),
    ),
  ).toEqual([]);
  await closeAndDisposeTerminals(page, servedHost.url, servedHost.secret);
});

test("opens file-tree rows despite normal pointer jitter", async ({ page, servedHost }) => {
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();

  const files = page.getByRole("complementary", { name: "Files and Changes" });
  const docs = files.locator('[data-file-path="docs"]');
  await clickWithPointerJitter(page, docs);
  await expect(docs).toHaveAttribute("aria-expanded", "true");

  await clickWithPointerJitter(page, files.locator('[data-file-path="docs/inside.md"]'));
  await expect(page.locator('.editor-buffer[data-buffer-kind="editable"]')).toContainText(
    "inside",
  );
});

async function seedDurableState(page: Page, url: string, secret: string): Promise<SeededState> {
  await page.goto(url);
  return page.evaluate(
    async ({ secret: processSecret }) => {
      const endpoint = new URL("/api/host", window.location.origin);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(endpoint);
      const inbox: unknown[] = [];
      const waiters: Array<(message: unknown) => void> = [];
      socket.addEventListener("message", ({ data }) => {
        const message: unknown = JSON.parse(String(data));
        const waiter = waiters.shift();
        if (waiter) waiter(message);
        else inbox.push(message);
      });
      const receive = (): Promise<unknown> => {
        const queued = inbox.shift();
        return queued === undefined
          ? new Promise((resolveMessage) => waiters.push(resolveMessage))
          : Promise.resolve(queued);
      };
      await new Promise<void>((resolveOpen, rejectOpen) => {
        socket.addEventListener("open", () => resolveOpen(), { once: true });
        socket.addEventListener("error", () => rejectOpen(new Error("socket failed")), {
          once: true,
        });
      });
      socket.send(
        JSON.stringify({
          protocolVersion: 1,
          type: "authenticate",
          secret: processSecret,
        }),
      );
      const authenticated = (await receive()) as Record<string, unknown>;
      if (authenticated.type !== "authenticated") throw new Error("authentication failed");

      let sequence = 0;
      const request = async <Result>(method: string, params: object): Promise<Result> => {
        const requestId = `seed-${++sequence}`;
        const response = receive();
        socket.send(
          JSON.stringify({
            protocolVersion: 1,
            type: "request",
            requestId,
            method,
            params,
          }),
        );
        const message = (await response) as Record<string, unknown>;
        if (message.type !== "response" || message.requestId !== requestId) {
          throw new Error("host request failed");
        }
        return message.result as Result;
      };
      const grants = await request<{
        projects: Array<{
          id: string;
          name: string;
          root: string;
          availability: string;
          worktrees: Array<{
            id: string;
            name: string;
            root: string;
            availability: string;
          }>;
        }>;
      }>("projectGrants.list", {});
      const project = grants.projects[0];
      const worktree = project?.worktrees[0];
      if (!project || !worktree) throw new Error("startup grant is missing");
      let revision = (
        await request<{ revision: { preferences: number; project: number } }>("state.describe", {})
      ).revision;
      const apply = async (mutation: object) => {
        const outcome = await request<{
          status: string;
          revision?: { preferences: number; project: number };
        }>("state.apply", { expectedRevision: revision, mutation });
        if (outcome.status !== "applied" || !outcome.revision) {
          throw new Error("durable mutation was not applied");
        }
        revision = outcome.revision;
      };
      await apply({
        kind: "replace-preferences",
        record: {
          schemaVersion: 1,
          values: {
            "zd.themeSelection.v1": JSON.stringify({
              selected: "dark",
              lastValid: "dark",
            }),
            "zd.workbenchSettings.v1": JSON.stringify({
              schemaVersion: 1,
              reading: { wordWrap: false },
            }),
          },
        },
      });
      const resource = {
        projectId: project.id,
        worktreeId: worktree.id,
        relativePath: "notes.md",
      };
      const fileId = `file:${project.id}\0${worktree.id}\0notes.md`;
      await apply({
        kind: "replace-workbench",
        record: {
          schemaVersion: 2,
          projects: [
            {
              id: project.id,
              name: project.name,
              root: project.root,
              availability: project.availability,
            },
          ],
          worktrees: [
            {
              id: worktree.id,
              projectId: project.id,
              name: worktree.name,
              root: worktree.root,
              availability: worktree.availability,
            },
          ],
          threads: [],
          openFiles: [{ id: fileId, ...resource, bufferId: `buffer:${fileId.slice(5)}` }],
          active: {
            projectId: project.id,
            worktreeId: worktree.id,
            threadId: null,
            fileId,
          },
          regions: {
            threads: { visibility: "collapsed", width: 236 },
            files: { visibility: "visible", width: 280, tab: "files" },
            centre: { mode: "overlap", split: 0.42 },
            focus: "file",
          },
          window: { presentation: "ordinary" },
          theme: { selected: "dark", lastValid: "dark" },
        },
      });
      await apply({
        kind: "put-draft",
        draft: {
          schemaVersion: 1,
          ...resource,
          text: "# Recovered across a new port\n\nUnsaved remote work.\n",
          updatedAt: 42,
        },
      });
      await apply({
        kind: "replace-review-ledger",
        ledger: {
          schemaVersion: 1,
          projectId: project.id,
          worktreeId: worktree.id,
          comments: [
            {
              id: "restart-comment",
              relative: "notes.md",
              startLine: 1,
              endLine: 1,
              selected: "Recovered across a new port",
              comment: "Review survived the restart",
            },
          ],
        },
      });
      await new Promise<void>((resolveClose) => {
        socket.addEventListener("close", () => resolveClose(), { once: true });
        socket.close();
      });
      const paired = await fetch("/api/pair", {
        body: JSON.stringify({ protocolVersion: 1, secret: processSecret }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
        redirect: "error",
      });
      if (paired.status !== 204) throw new Error("browser pairing failed");
      return { projectId: project.id, worktreeId: worktree.id };
    },
    { secret },
  );
}

async function terminalPid(output: Locator, marker: string): Promise<string> {
  const pattern = new RegExp(`${marker}(\\d+)`, "u");
  await expect.poll(() => output.innerText()).toMatch(pattern);
  return (await output.innerText()).match(pattern)![1]!;
}

async function enterTerminalCommand(terminal: Locator, command: string): Promise<void> {
  const input = terminal.getByRole("textbox", { name: /Project terminal input/u });
  await input.pressSequentially(command, { delay: 5 });
  await input.press("Enter");
}

async function closeAndDisposeTerminals(page: Page, url: string, secret: string): Promise<void> {
  const context = page.context();
  await page.close();
  const cleanupPage = await context.newPage();
  try {
    await disposeServedTerminals(cleanupPage, url, secret);
  } finally {
    await cleanupPage.close();
  }
}

test("edits, watches, and runs a reconnectable shell through the real host", async ({
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
  const docs = files.locator('[data-file-path="docs"]');
  await expect(docs).toHaveAttribute("aria-expanded", "false");
  await docs.click();
  await expect(docs).toHaveAttribute("aria-expanded", "true");
  const nested = files.locator('[data-file-path="docs/inside.md"]');
  await expect(nested).toBeVisible();
  await nested.click();
  await expect(page.locator('.editor-buffer[data-buffer-kind="editable"]')).toContainText("inside");
  const servedNotice = page.getByRole("status", { name: "Served workbench limits" });
  await expect(servedNotice).toContainText(
    "Remote project folders can be opened beside the current project. Recent workspaces and desktop notifications are unavailable",
  );
  await servedNotice.getByRole("button", { name: "Dismiss remote-host notice" }).click();
  await expect(servedNotice).toHaveCount(0);

  await servedHost.createExternalFile();
  await expect(files.locator('[data-file-path="external-watch.md"]')).toBeVisible();
  await files.locator('[data-file-path="notes.md"]').click();

  const buffer = page.locator('.editor-buffer[data-buffer-kind="editable"]');
  await expect(buffer).toBeVisible();
  await expect(buffer).toContainText("Opened through the real Rust host.");
  await expect(buffer.locator(".md-editor")).toHaveAttribute("data-editable", "true");
  await expect(buffer.locator(".cm-content")).toHaveAttribute("contenteditable", "true");

  const content = buffer.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nSaved through the remote host.\n");
  await expect(files.locator('[data-file-path="notes.md"]')).toHaveAttribute("data-dirty", "true");
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => servedHost.readFixtureFile()).toContain("Saved through the remote host.");
  await expect(files.locator('[data-file-path="notes.md"]')).not.toHaveAttribute(
    "data-dirty",
    "true",
  );
  const draftKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("zd.fileDraft.v1:")),
  );
  expect(draftKeys).toEqual([]);
  await expect
    .poll(() => servedHost.readPersistedState())
    .not.toContain("Saved through the remote host.");

  await files.locator('[data-file-path="docs"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "New File…" }).click();
  const create = page.getByRole("dialog", { name: "New file in docs" });
  await create.getByRole("textbox", { name: "Name" }).fill("served-new.md");
  await create.getByRole("button", { name: "Create" }).click();
  const created = files.locator('[data-file-path="docs/served-new.md"]');
  await expect(created).toBeVisible();
  await created.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  const rename = page.getByRole("dialog", { name: "Rename served-new.md" });
  await rename.getByRole("textbox", { name: "New name" }).fill("served-renamed.md");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(files.locator('[data-file-path="docs/served-renamed.md"]')).toBeVisible();
  await expect
    .poll(() => servedHost.readFixtureDocs())
    .toEqual(expect.arrayContaining(["inside.md", "served-renamed.md"]));

  await files.locator('[data-file-path="notes.md"]').click();
  await content.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>(".current-file .cm-content");
    if (!target) throw new Error("the served editor is unavailable");
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
  await expect(buffer.getByRole("img", { name: "Screenshot" })).toBeVisible();
  await expect.poll(() => servedHost.readFixtureScreenshots()).toHaveLength(1);
  expect((await servedHost.readFixtureScreenshots())[0]).toMatch(/\.png$/u);
  await page.keyboard.press("ControlOrMeta+s");
  await expect
    .poll(() => servedHost.readFixtureFile())
    .toContain("![Screenshot](docs/screenshots/");

  await files.getByRole("tab", { name: "CHANGES" }).click();
  const changes = files.getByRole("region", { name: "Changes" });
  await changes.getByRole("button", { name: "Refresh Git status" }).click();
  const changedNotes = changes.getByRole("listitem", { name: "notes.md, modified" });
  await expect(changedNotes).toBeVisible();
  await expect(
    changes.getByRole("listitem", { name: "docs/served-renamed.md, untracked" }),
  ).toBeVisible();
  const history = changes.locator("[data-commit-id]");
  await expect(history).toHaveCount(1);
  await expect(history).toContainText("Initial served fixture");
  await changedNotes.click();
  const comparison = page.getByRole("region", { name: "Read-only file comparison" });
  await expect(comparison).toBeVisible();
  await expect(comparison.locator('[data-diff-side="base"]')).toContainText(
    "Opened through the real Rust host.",
  );
  await expect(comparison.locator('[data-diff-side="head"]')).toContainText(
    "Saved through the remote host.",
  );
  await comparison.getByRole("button", { name: "Close file comparison" }).click();

  await page.keyboard.press("ControlOrMeta+,");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings
    .getByRole("radiogroup", { name: "Theme", exact: true })
    .getByRole("radio", { name: "Served Fixture" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-name", "served");
  const diagnosticSettings = settings.locator('[data-diagnostic-settings="true"]');
  const diagnosticToggle = diagnosticSettings.getByRole("checkbox", {
    name: "Host diagnostics",
  });
  await expect(diagnosticToggle).not.toBeChecked();
  await diagnosticToggle.check();
  await expect(diagnosticSettings.getByRole("status")).toHaveText("Recording on host.");
  await diagnosticToggle.uncheck();
  await expect(diagnosticSettings.getByRole("status")).toHaveText("Off.");
  const diagnosticEvidence = await servedHost.readDiagnostics();
  expect(diagnosticEvidence).toContain('"operation":"diagnostics.enable"');
  expect(diagnosticEvidence).not.toContain(servedHost.secret);
  expect(diagnosticEvidence).not.toContain("notes.md");
  expect(diagnosticEvidence).not.toContain("Saved through the remote host.");
  await settings.getByRole("button", { name: "Close Settings" }).click();

  await page.keyboard.press("ControlOrMeta+j");
  const terminal = page.locator("[data-project-terminal]");
  await expect(terminal).toBeVisible();
  await expect(terminal.locator(".zd-terminal-thread-surface")).toHaveAttribute(
    "data-terminal-status",
    "running",
  );
  const originalSessionId = await terminal
    .locator(".zd-terminal-thread-surface")
    .getAttribute("data-terminal-session-id");
  if (!originalSessionId) throw new Error("the project terminal did not expose its session ID");
  const terminalOutput = terminal.locator(".xterm-rows");
  await enterTerminalCommand(terminal, "printf '__ZD_PID__%s\\n' \"$$\"");
  const originalPid = await terminalPid(terminalOutput, "__ZD_PID__");

  await page.context().setOffline(true);
  await page.waitForTimeout(250);
  await page.context().setOffline(false);
  await page.waitForTimeout(1_500);
  await enterTerminalCommand(terminal, "printf '__ZD_PID_AFTER__%s\\n' \"$$\"");
  expect(await terminalPid(terminalOutput, "__ZD_PID_AFTER__")).toBe(originalPid);

  await page.reload();
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect to zd" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+j");
  const reattachedTerminal = page.locator("[data-project-terminal]");
  await expect(reattachedTerminal).toBeVisible();
  await expect(reattachedTerminal.locator(".zd-terminal-thread-surface")).toHaveAttribute(
    "data-terminal-status",
    "running",
  );
  await expect(reattachedTerminal.locator(".zd-terminal-thread-surface")).toHaveAttribute(
    "data-terminal-session-id",
    originalSessionId,
  );
  expect(servedHost.isProcessRunning(Number(originalPid))).toBe(true);

  expect(await page.evaluate(() => fetch("/notes.md").then((response) => response.status))).toBe(
    404,
  );
  const browserState = await page.evaluate(() => ({
    cookies: document.cookie,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(browserState.cookies).not.toContain("zd_pairing_v1");
  expect(JSON.stringify(browserState)).not.toContain(servedHost.secret);
  const cookies = await page.context().cookies();
  const pairingCookie = cookies.find((cookie) => cookie.name === "zd_pairing_v1");
  expect(pairingCookie).toBeDefined();
  expect({
    httpOnly: pairingCookie?.httpOnly,
    path: pairingCookie?.path,
    sameSite: pairingCookie?.sameSite,
  }).toEqual({ httpOnly: true, path: "/api/host", sameSite: "Strict" });
  expect(JSON.stringify(cookies)).not.toContain(servedHost.secret);
  expect(requestedUrls.length).toBeGreaterThan(0);
  expect(requestedUrls.every((url) => !url.includes(servedHost.secret))).toBe(true);
  expect(consoleMessages.every((message) => !message.includes(servedHost.secret))).toBe(true);
  await closeAndDisposeTerminals(page, servedHost.url, servedHost.secret);
});

test("keeps every project terminal through a served-host process restart", async ({
  page,
  servedHost,
}) => {
  const terminalWrites = captureTerminalWrites(page);
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+j");
  const terminal = page.locator("[data-project-terminal]");
  await expect(terminal).toBeVisible();
  await expect(terminal.locator(".zd-terminal-thread-surface")).toHaveAttribute(
    "data-terminal-status",
    "running",
  );
  await page.keyboard.press("ControlOrMeta+d");
  const originalPanes = terminal.locator("[data-project-terminal-pane]");
  await expect(originalPanes).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(originalPanes.nth(index).locator(".zd-terminal-thread-surface")).toHaveAttribute(
      "data-terminal-status",
      "running",
    );
  }
  const originalSessionIds = await originalPanes
    .locator(".zd-terminal-thread-surface")
    .evaluateAll((surfaces) =>
      surfaces.map((surface) => surface.getAttribute("data-terminal-session-id")),
    );
  expect(originalSessionIds.every((sessionId) => sessionId !== null)).toBe(true);
  const originalPids: string[] = [];
  for (let index = 0; index < 2; index += 1) {
    const pane = originalPanes.nth(index);
    const sessionId = originalSessionIds[index]!;
    const marker = `__ZD_RESTART_PID_${index + 1}__`;
    const command = `printf '${marker}%s\\n' "$$"`;
    const checkpoint = terminalWrites.checkpoint(sessionId);
    await enterTerminalCommand(pane, command);
    await expect.poll(() => terminalWrites.textAfter(sessionId, checkpoint)).toBe(`${command}\r`);
    originalPids.push(await terminalPid(pane.locator(".xterm-rows"), marker));
  }

  const restarted = await servedHost.restart();
  await page.goto(restarted.url);
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect to zd" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+j");
  const restored = page.locator("[data-project-terminal]");
  const restoredPanes = restored.locator("[data-project-terminal-pane]");
  await expect(restoredPanes).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    await expect(restoredPanes.nth(index).locator(".zd-terminal-thread-surface")).toHaveAttribute(
      "data-terminal-status",
      "running",
    );
  }
  expect(
    await restoredPanes
      .locator(".zd-terminal-thread-surface")
      .evaluateAll((surfaces) =>
        surfaces.map((surface) => surface.getAttribute("data-terminal-session-id")),
      ),
  ).toEqual(originalSessionIds);
  for (let index = 0; index < 2; index += 1) {
    const pane = restoredPanes.nth(index);
    const sessionId = originalSessionIds[index]!;
    const marker = `__ZD_RESTART_PID_${index + 1}__`;
    const afterMarker = `__ZD_RESTART_PID_AFTER_${index + 1}__`;
    const pid = originalPids[index]!;
    await expect(pane.locator(".xterm-rows")).toContainText(`${marker}${pid}`);
    expect(servedHost.isProcessRunning(Number(pid))).toBe(true);
    const command = `printf '${afterMarker}%s\\n' "$$"`;
    const checkpoint = terminalWrites.checkpoint(sessionId);
    await enterTerminalCommand(pane, command);
    await expect.poll(() => terminalWrites.textAfter(sessionId, checkpoint)).toBe(`${command}\r`);
    expect(await terminalPid(pane.locator(".xterm-rows"), afterMarker)).toBe(pid);
  }
  await closeAndDisposeTerminals(page, restarted.url, restarted.secret);
});

test("hands a paired workbench to a new page without another secret", async ({
  page,
  servedHost,
}) => {
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();

  const replacement = await page.context().newPage();
  try {
    await replacement.goto(servedHost.url);
    await expect(replacement.locator(".zd-workbench")).toBeVisible();
    await expect(replacement.getByRole("heading", { name: "Connect to zd" })).toHaveCount(0);
    await openNestedFixtureFile(replacement);

    await page.bringToFront();
    await openNestedFixtureFile(page);
  } finally {
    await replacement.close();
  }
});

test("restores stable identities and all durable records in a new process and origin", async ({
  page,
  servedHost,
}) => {
  const original = { url: servedHost.url, secret: servedHost.secret };
  const seeded = await seedDurableState(page, original.url, original.secret);

  const restarted = await servedHost.restart();

  expect(new URL(restarted.url).port).not.toBe(new URL(original.url).port);
  expect(restarted.secret).not.toBe(original.secret);
  const persisted = await servedHost.readPersistedState();
  expect(persisted).not.toContain(original.secret);
  expect(persisted).not.toContain(restarted.secret);

  await page.goto(restarted.url);
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect to zd" })).toHaveCount(0);
  await expect(page.locator(`[data-project-id="${seeded.projectId}"]`)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme-name", "dark");
  const buffer = page.locator('.editor-buffer[data-buffer-kind="editable"]');
  await expect(buffer).toContainText("Recovered across a new port");
  await expect(buffer.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
  await expect(page.locator('[data-file-path="notes.md"]')).toHaveAttribute("data-dirty", "true");
  await expect(servedHost.readFixtureFile()).resolves.not.toContain("Recovered across a new port");
  await expect(buffer.locator(".cm-content")).not.toHaveClass(/cm-lineWrapping/u);
  await page.getByRole("button", { name: "View Markdown feedback" }).click();
  await expect(page.getByRole("dialog", { name: "Feedback" })).toContainText(
    "Review survived the restart",
  );

  const browserState = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(browserState).toEqual({ local: [], session: [] });
  expect(JSON.stringify(browserState)).not.toContain(restarted.secret);
});

test("opens a remote folder beside the current project and activates its file", async ({
  page,
  servedHost,
}) => {
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();

  await page.getByRole("button", { name: "Open project folder" }).click();
  const picker = page.getByRole("dialog", { name: "Open remote folder" });
  await expect(picker).toBeVisible();
  const pickerList = picker.locator(".zd-remote-project-picker-list");
  await expect
    .poll(() =>
      pickerList.evaluate((list) => ({
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
      })),
    )
    .toMatchObject({
      clientHeight: expect.any(Number),
      scrollHeight: expect.any(Number),
    });
  const pickerGeometry = await picker.evaluate((dialog) => {
    const list = dialog.querySelector<HTMLElement>(".zd-remote-project-picker-list");
    if (!list) throw new Error("the remote folder list is missing");
    const dialogBounds = dialog.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    return {
      dialogBottom: dialogBounds.bottom,
      dialogTop: dialogBounds.top,
      listBottom: listBounds.bottom,
      listTop: listBounds.top,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
  expect(pickerGeometry.dialogTop).toBeGreaterThanOrEqual(0);
  expect(pickerGeometry.dialogBottom).toBeLessThanOrEqual(pickerGeometry.viewportHeight);
  expect(pickerGeometry.listTop).toBeGreaterThanOrEqual(pickerGeometry.dialogTop);
  expect(pickerGeometry.listBottom).toBeLessThanOrEqual(pickerGeometry.dialogBottom);
  expect(pickerGeometry.listScrollHeight).toBeGreaterThan(pickerGeometry.listClientHeight);
  await pickerList.evaluate((list) => {
    list.scrollTop = list.scrollHeight;
  });
  await expect.poll(() => pickerList.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  await picker
    .getByRole("searchbox", { name: "Filter folders by name" })
    .fill(servedHost.secondProjectName);
  await picker.getByRole("button", { name: "Filter", exact: true }).click();
  await picker.getByRole("button", { name: servedHost.secondProjectName, exact: true }).click();
  await expect(picker.locator(".zd-remote-project-picker-path")).toContainText(
    servedHost.secondProjectName,
  );
  await picker.getByRole("button", { name: "Open This Folder" }).click();

  await expect(page.locator(".zd-project-group")).toHaveCount(2);
  await expect(
    page.locator(".zd-project-name").filter({ hasText: servedHost.secondProjectName }),
  ).toHaveText(servedHost.secondProjectName);
  const secondFile = page.locator('[data-file-path="second.md"]');
  await expect(secondFile).toBeVisible();
  await secondFile.click();
  await expect(page.locator('.editor-buffer[data-buffer-kind="editable"]')).toContainText(
    "Opened from the remote folder browser.",
  );
  const addedBuffer = page.locator('.editor-buffer[data-buffer-kind="editable"]');
  await addedBuffer.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nUnsaved in the added remote project.\n");
  await expect(secondFile).toHaveAttribute("data-dirty", "true");
  await expect
    .poll(() => servedHost.readPersistedState())
    .toContain("Unsaved in the added remote project.");

  await page.keyboard.press("ControlOrMeta+j");
  const terminal = page.locator("[data-project-terminal]");
  await expect(terminal).toBeVisible();
  const terminalSurface = terminal.locator(".zd-terminal-thread-surface");
  await expect(terminalSurface).toHaveAttribute("data-terminal-status", "running");
  const originalSessionId = await terminalSurface.getAttribute("data-terminal-session-id");
  if (!originalSessionId) throw new Error("the added project terminal has no session ID");
  const marker = "__ZD_ADDED_PROJECT_PID__";
  await enterTerminalCommand(terminal, `printf '${marker}%s\\n' "$$"`);
  const originalPid = await terminalPid(terminal.locator(".xterm-rows"), marker);
  await expect.poll(() => servedHost.readPersistedState()).toContain(servedHost.secondProjectName);

  const restarted = await servedHost.restart();
  await page.goto(restarted.url);
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect to zd" })).toHaveCount(0);
  await expect(page.locator(".zd-project-group")).toHaveCount(2);
  await expect(
    page.locator(".zd-project-name").filter({ hasText: servedHost.secondProjectName }),
  ).toHaveText(servedHost.secondProjectName);
  await expect(page.locator('.editor-buffer[data-buffer-kind="editable"]')).toContainText(
    "Unsaved in the added remote project.",
  );
  await expect(page.locator('[data-file-path="second.md"]')).toHaveAttribute("data-dirty", "true");
  await expect(servedHost.readSecondProjectFile()).resolves.not.toContain(
    "Unsaved in the added remote project.",
  );
  await page.keyboard.press("ControlOrMeta+j");
  const restoredTerminal = page.locator("[data-project-terminal]");
  await expect(restoredTerminal.locator(".zd-terminal-thread-surface")).toHaveAttribute(
    "data-terminal-session-id",
    originalSessionId,
  );
  expect(servedHost.isProcessRunning(Number(originalPid))).toBe(true);
  await closeAndDisposeTerminals(page, restarted.url, restarted.secret);
});
