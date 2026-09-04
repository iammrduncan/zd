import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = resolve("packages/scripts/release/linux-install-lifecycle.mjs");
const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("the isolated Linux package lifecycle", () => {
  it("rejects a temporary-looking symlink before asking dpkg to remove anything", async () => {
    const protectedRoot = mkdtempSync(join(tmpdir(), "zd-linux-protected-"));
    const sentinel = join(protectedRoot, "keep.txt");
    writeFileSync(sentinel, "keep\n");
    const suffix = protectedRoot.slice(-6).replace(/[^A-Za-z0-9]/gu, "A");
    const linkedRoot = join(tmpdir(), `zd-linux-install.${suffix}`);
    symlinkSync(protectedRoot, linkedRoot, "dir");
    temporaryPaths.push(linkedRoot, protectedRoot);

    await expect(
      execFileAsync(process.execPath, [script, "remove", linkedRoot]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Linux package lifecycle root is not an expected temporary directory",
      ),
    });
    expect(() => writeFileSync(sentinel, "still here\n")).not.toThrow();
  });
});
