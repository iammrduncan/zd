import { disposeServedTerminals, expect, test } from "./host.fixture";

test("startup recovers a live thread whose saved state says its terminal failed", async ({
  page,
  servedHost,
}) => {
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+n");
  const thread = page.locator("[data-thread-id]").first();
  await expect(thread).toBeVisible();
  const threadId = await thread.getAttribute("data-thread-id");
  if (!threadId) throw new Error("the created thread has no durable identity");
  const terminal = page.locator(".zd-terminal-thread-surface");
  await expect(terminal).toHaveAttribute("data-terminal-status", "running");
  const sessionId = await terminal.getAttribute("data-terminal-session-id");
  const input = terminal.getByRole("textbox");
  await input.pressSequentially("printf '__ZD_THREAD_PID__%s\\n' \"$$\"");
  await input.press("Enter");
  await expect
    .poll(() => terminal.locator(".xterm-rows").innerText())
    .toMatch(/__ZD_THREAD_PID__\d+/);
  const pid = (await terminal.locator(".xterm-rows").innerText()).match(
    /__ZD_THREAD_PID__(\d+)/,
  )![1]!;
  await expect.poll(() => servedHost.readPersistedState()).toContain(threadId);

  const restarted = await servedHost.restart({ failedThreadId: threadId });
  expect(servedHost.isProcessRunning(Number(pid))).toBe(true);
  const failedState = await servedHost.readPersistedState();
  expect(failedState).toContain('"backingAvailability":"missing"');
  expect(failedState).toContain("The terminal process could not be started or observed.");

  await page.goto(restarted.url);
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await expect(terminal).toHaveAttribute("data-terminal-status", "running");
  await expect(terminal).toHaveAttribute("data-terminal-session-id", sessionId!);
  await expect(page.getByRole("button", { name: "Restart terminal" })).toHaveCount(0);
  await expect(terminal.locator(".xterm-rows")).toContainText(`__ZD_THREAD_PID__${pid}`);
  await input.pressSequentially("printf '__ZD_RESTORED_PID__%s\\n' \"$$\"");
  await input.press("Enter");
  await expect(terminal.locator(".xterm-rows")).toContainText(`__ZD_RESTORED_PID__${pid}`);
  await expect
    .poll(() => servedHost.readPersistedState())
    .not.toContain("The terminal process could not be started or observed.");

  await page.reload();
  await expect(terminal).toHaveAttribute("data-terminal-status", "running");
  await expect(terminal).toHaveAttribute("data-terminal-session-id", sessionId!);
  await expect(page.getByRole("button", { name: "Restart terminal" })).toHaveCount(0);
});

test("terminal fixture cleanup can claim control before the previous page disconnects", async ({
  page,
  servedHost,
}) => {
  await page.goto(servedHost.url);
  await page.getByLabel("Process secret").fill(servedHost.secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+j");
  const terminal = page.locator("[data-project-terminal]");
  await expect(terminal.locator(".zd-terminal-thread-surface")).toHaveAttribute(
    "data-terminal-status",
    "running",
  );
  const input = terminal.getByRole("textbox");
  await input.pressSequentially("printf '__ZD_CLEANUP_PID__%s\\n' \"$$\"");
  await input.press("Enter");
  await expect
    .poll(() => terminal.locator(".xterm-rows").innerText())
    .toMatch(/__ZD_CLEANUP_PID__\d+/);
  const pid = Number(
    (await terminal.locator(".xterm-rows").innerText()).match(/__ZD_CLEANUP_PID__(\d+)/)![1],
  );
  const cleanup = await page.context().newPage();
  try {
    await disposeServedTerminals(cleanup, servedHost.url, servedHost.secret);
    await expect.poll(() => servedHost.isProcessRunning(pid)).toBe(false);
  } finally {
    await cleanup.close();
  }
});
