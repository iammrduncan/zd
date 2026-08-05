import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "packages/app/dist",
      "node_modules",
      "packages/tauri",
      "packages/app/assets",
      "coverage",
      "playwright-report",
      "test-results",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // A soft ceiling, not a gate. `app.rs` reached 14,211 lines in the first
      // prototype; this warns long before that so the split happens at a seam
      // instead of a crisis. See docs/adr/suite/0001-use-tauri-with-portable-web-frontend_H.md.
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
);
