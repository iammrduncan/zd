import { defineConfig, devices } from "@playwright/test";

interface BrowserTestServer {
  readonly port: number;
  readonly url: string;
  readonly reuseExistingServer: boolean;
}

/** Resolve an isolated local server without silently accepting another app on the same port. */
export function browserTestServer(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BrowserTestServer {
  const rawPort = environment.ZD_E2E_PORT ?? "1420";
  if (!/^\d+$/u.test(rawPort)) {
    throw new Error("ZD_E2E_PORT must be an integer from 1024 through 65535");
  }
  const port = Number(rawPort);
  if (port < 1024 || port > 65_535) {
    throw new Error("ZD_E2E_PORT must be an integer from 1024 through 65535");
  }
  return {
    port,
    url: `http://localhost:${port}`,
    reuseExistingServer: environment.ZD_E2E_REUSE_SERVER === "1",
  };
}

const server = browserTestServer();

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
    baseURL: server.url,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${server.port}`,
    url: server.url,
    reuseExistingServer: server.reuseExistingServer,
  },
});
