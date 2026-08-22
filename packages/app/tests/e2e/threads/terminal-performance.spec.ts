import { expect, test } from "@playwright/test";

const MEBIBYTE = 1_024 * 1_024;

test("keeps terminal rendering bounded in the release bundle", async ({ page }, testInfo) => {
  await page.goto("/dev/terminal-performance.html");
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const readMetric = async (name: string): Promise<number> => {
    const result = await session.send("Performance.getMetrics");
    return result.metrics.find((metric) => metric.name === name)?.value ?? 0;
  };
  const collectHeap = async (): Promise<number> => {
    await session.send("HeapProfiler.collectGarbage");
    return readMetric("JSHeapUsedSize");
  };

  const heapBeforeInactive = await collectHeap();
  const inactiveCount = await page.evaluate(() =>
    window.terminalPerformanceFixture.mountInactive(24),
  );
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const heapAfterInactive = await collectHeap();

  const outputStarted = performance.now();
  const outputBytes = await page.evaluate(
    (minimumBytes) => window.terminalPerformanceFixture.writeBurst(minimumBytes),
    MEBIBYTE,
  );
  await expect(page.getByRole("application").first()).toContainText("TERMINAL_BURST_COMPLETE");
  const outputMs = performance.now() - outputStarted;

  const resizeMs = await page.evaluate(() =>
    window.terminalPerformanceFixture.resizeActive(640, 420),
  );
  const callsBeforeIdle = await page.evaluate(() => window.terminalPerformanceFixture.calls.length);
  const taskBeforeIdle = await readMetric("TaskDuration");
  await page.waitForTimeout(500);
  const idleTaskMs = ((await readMetric("TaskDuration")) - taskBeforeIdle) * 1_000;
  const callsAfterIdle = await page.evaluate(() => window.terminalPerformanceFixture.calls.length);

  const heapDelta = Math.max(0, heapAfterInactive - heapBeforeInactive);
  const metrics = {
    releaseBundle: true,
    outputBytes,
    outputMs,
    throughputMebibytesPerSecond: outputBytes / MEBIBYTE / (outputMs / 1_000),
    resizeMs,
    inactiveCount,
    heapBeforeInactive,
    heapAfterInactive,
    heapDeltaPerInactiveTerminal: heapDelta / inactiveCount,
    idleWindowMs: 500,
    idleTaskMs,
    callsDuringIdle: callsAfterIdle - callsBeforeIdle,
  };
  await testInfo.attach("terminal-release-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  testInfo.annotations.push({ type: "terminal-performance", description: JSON.stringify(metrics) });
  console.info("terminal release fixture", metrics);

  expect(outputBytes).toBeGreaterThanOrEqual(MEBIBYTE);
  expect(outputMs).toBeLessThan(5_000);
  expect(resizeMs).toBeLessThan(1_000);
  expect(inactiveCount).toBe(24);
  expect(heapAfterInactive).toBeLessThan(512 * MEBIBYTE);
  expect(metrics.heapDeltaPerInactiveTerminal).toBeLessThan(16 * MEBIBYTE);
  expect(idleTaskMs).toBeLessThan(200);
  expect(metrics.callsDuringIdle).toBe(0);
});
