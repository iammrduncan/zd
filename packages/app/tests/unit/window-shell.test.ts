import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vitest";

it("allows the main window to start a native drag", () => {
  const capability = JSON.parse(
    readFileSync(resolve(process.cwd(), "packages/tauri/capabilities/default.json"), "utf8"),
  ) as { permissions: string[] };

  expect(capability.permissions).toContain("core:window:allow-start-dragging");
});
