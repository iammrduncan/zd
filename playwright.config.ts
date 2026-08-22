import { defineConfig, devices } from "@playwright/test";

// Playwright drives the frontend in a real browser against the Vite dev server.
// This is where layout and visual claims get verified — computed styles, element
// geometry, transition timing. The Tauri shell is checked by hand, per phase.
export default defineConfig({
  testDir: "./packages/app/tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  testIgnore: "**/*-performance.spec.ts",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
  },
});
