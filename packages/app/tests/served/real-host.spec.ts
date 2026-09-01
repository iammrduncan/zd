import { expect, test } from "./host.fixture";
import type { Page } from "@playwright/test";

interface SeededState {
  readonly projectId: string;
  readonly worktreeId: string;
}

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
      return { projectId: project.id, worktreeId: worktree.id };
    },
    { secret },
  );
}

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
  await page.getByLabel("Process secret").fill(restarted.secret);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.locator(".zd-workbench")).toBeVisible();
  await expect(page.locator(`[data-project-id="${seeded.projectId}"]`)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme-name", "dark");
  const buffer = page.locator('.editor-buffer[data-buffer-kind="read-only"]');
  await expect(buffer).toContainText("Recovered across a new port");
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
