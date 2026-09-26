import { expect, test } from "@playwright/test";

const MEBIBYTE = 1_024 * 1_024;

test("keeps attention delivery event-driven in the release bundle", async ({ page }, testInfo) => {
  await page.goto("/dev/attention-performance.html");
  await expect(page.locator("#attention-performance")).toHaveAttribute("data-ready", "true");
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const readMetric = async (name: string): Promise<number> => {
    const result = await session.send("Performance.getMetrics");
    return result.metrics.find((metric) => metric.name === name)?.value ?? 0;
  };

  const dispatchMs = await page.evaluate(() => window.attentionPerformanceFixture.dispatch(1_000));
  const callsBeforeIdle = await page.evaluate(
    () => window.attentionPerformanceFixture.calls.length,
  );
  const taskBeforeIdle = await readMetric("TaskDuration");
  await page.waitForTimeout(500);
  const idleTaskMs = ((await readMetric("TaskDuration")) - taskBeforeIdle) * 1_000;
  const callsAfterIdle = await page.evaluate(() => window.attentionPerformanceFixture.calls.length);
  const heapBytes = await readMetric("JSHeapUsedSize");
  const metrics = {
    releaseBundle: true,
    attentionEvents: 1_000,
    dispatchMs,
    adapterCalls: callsBeforeIdle,
    idleWindowMs: 500,
    idleTaskMs,
    callsDuringIdle: callsAfterIdle - callsBeforeIdle,
    heapBytes,
  };
  await testInfo.attach("attention-release-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  testInfo.annotations.push({
    type: "attention-performance",
    description: JSON.stringify(metrics),
  });
  console.info("Attention release fixture", metrics);

  expect(dispatchMs).toBeLessThan(2_000);
  expect(callsBeforeIdle).toBe(3_000);
  expect(heapBytes).toBeLessThan(128 * MEBIBYTE);
  expect(idleTaskMs).toBeLessThan(100);
  expect(metrics.callsDuringIdle).toBe(0);
});
