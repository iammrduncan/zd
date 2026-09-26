import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./packages/app/src", import.meta.url)),
    },
  },
  test: {
    // Unit tests only. Layout and visual claims belong in tests/e2e via Playwright,
    // which has a real engine and can measure computed styles and geometry.
    include: ["packages/*/tests/unit/**/*.test.ts"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    setupFiles: ["packages/app/tests/setup.ts"],
  },
});
