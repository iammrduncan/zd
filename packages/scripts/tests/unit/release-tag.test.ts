import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const CHECKER = resolve(ROOT, "packages/scripts/check-release-tag.mjs");
const version = (
  JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    version: string;
  }
).version;

function check(tag?: string) {
  return spawnSync(process.execPath, tag ? [CHECKER, tag] : [CHECKER], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("the release tag guard", () => {
  it("accepts the v-prefixed package version", () => {
    const result = check(`v${version}`);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`v${version}`);
  });

  it("refuses to publish a tag for a different version", () => {
    const result = check("v9.9.9");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`expected v${version}`);
  });

  it("refuses an unnamed release", () => {
    const result = check();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release tag is required");
  });
});
