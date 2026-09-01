import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, it } from "vitest";

it("allows only the active served main window to start a native drag", () => {
  const localCapability = JSON.parse(
    readFileSync(resolve(process.cwd(), "packages/tauri/capabilities/default.json"), "utf8"),
  ) as { permissions: string[] };
  const servedCapability = readFileSync(
    resolve(process.cwd(), "packages/tauri/src/desktop.rs"),
    "utf8",
  );

  expect(localCapability.permissions).not.toContain("core:window:allow-start-dragging");
  expect(servedCapability).toContain('.window("main")');
  expect(servedCapability).toContain('.permission("core:window:allow-start-dragging")');
});
