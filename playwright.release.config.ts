import { defineConfig, devices } from "@playwright/test";

/** Release-bundle checkpoints run against Vite's production preview server. */
export default defineConfig({
  testDir: "./packages/app/tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  testMatch: "**/terminal-performance.spec.ts",
  use: {
    baseURL: "http://localhost:1422",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build:e2e && npm run preview -- --port 1422",
    url: "http://localhost:1422",
    reuseExistingServer: false,
  },
});
