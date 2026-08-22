import { expect, test } from "@playwright/test";

const MEBIBYTE = 1_024 * 1_024;

test("keeps Changes navigation bounded in the release bundle", async ({ page }, testInfo) => {
  await page.goto("/dev/changes-performance.html");
  await expect(page.locator("[data-commit-id]")).toHaveCount(50);
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const readMetric = async (name: string): Promise<number> => {
    const result = await session.send("Performance.getMetrics");
    return result.metrics.find((metric) => metric.name === name)?.value ?? 0;
  };

  const timings = await page.evaluate(async () => {
    const fixture = window.changesPerformanceFixture;
    const filterMs = fixture.filter("file-09999");
    fixture.filter("");
    return {
      initialRenderMs: fixture.initialRenderMs,
      filterMs,
      refreshStatusMs: await fixture.refreshStatus(),
      historyPageMs: await fixture.loadMoreHistory(),
      diffMs: await fixture.openFirstDiff(),
    };
  });
  const callsBeforeIdle = await page.evaluate(() => window.changesPerformanceFixture.calls.length);
  const taskBeforeIdle = await readMetric("TaskDuration");
  await page.waitForTimeout(500);
  const idleTaskMs = ((await readMetric("TaskDuration")) - taskBeforeIdle) * 1_000;
  const callsAfterIdle = await page.evaluate(() => window.changesPerformanceFixture.calls.length);
  const heapBytes = await readMetric("JSHeapUsedSize");
  const metrics = {
    releaseBundle: true,
    statusEntries: 10_000,
    liveRows: await page.locator("[data-change-id]").count(),
    historyCommits: await page.locator("[data-commit-id]").count(),
    heapBytes,
    idleWindowMs: 500,
    idleTaskMs,
    callsDuringIdle: callsAfterIdle - callsBeforeIdle,
    ...timings,
  };
  await testInfo.attach("changes-release-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  testInfo.annotations.push({ type: "changes-performance", description: JSON.stringify(metrics) });
  console.info("Changes release fixture", metrics);

  expect(metrics.initialRenderMs).toBeLessThan(2_000);
  expect(metrics.filterMs).toBeLessThan(500);
  expect(metrics.refreshStatusMs).toBeLessThan(1_000);
  expect(metrics.historyPageMs).toBeLessThan(1_000);
  expect(metrics.diffMs).toBeLessThan(2_000);
  expect(metrics.liveRows).toBeLessThan(48);
  expect(metrics.historyCommits).toBe(100);
  expect(heapBytes).toBeLessThan(256 * MEBIBYTE);
  expect(idleTaskMs).toBeLessThan(150);
  expect(metrics.callsDuringIdle).toBe(0);
});
