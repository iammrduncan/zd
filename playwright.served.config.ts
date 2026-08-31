import { defineConfig, devices } from "@playwright/test";

/** Chromium drives the production application through the real Rust served host. */
export default defineConfig({
  testDir: "./packages/app/tests/served",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: { trace: "on-first-retry" },
  projects: [{ name: "served-chromium", use: { ...devices["Desktop Chrome"] } }],
});
