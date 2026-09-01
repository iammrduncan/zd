import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyReleaseDownloads } from "../../../release/verify-downloads.mjs";

const temporaryDirectories: string[] = [];

function fixture(version = "1.2.3") {
  const directory = mkdtempSync(join(tmpdir(), "zd-release-downloads-"));
  temporaryDirectories.push(directory);
  const artifacts = [
    `zd_${version}_arm64.dmg`,
    `zd_${version}_x86_64.dmg`,
    `zd_${version}_amd64.deb`,
  ];
  for (const artifact of artifacts) {
    const bytes = Buffer.from(`artifact:${artifact}\n`);
    writeFileSync(join(directory, artifact), bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(directory, `${artifact}.sha256`), `${hash}  ${artifact}\n`);
  }
  return { artifacts, directory, version };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("the collected release downloads", () => {
  it("accepts exactly two DMGs, one Debian package, and matching checksums", async () => {
    const { artifacts, directory, version } = fixture();

    await expect(verifyReleaseDownloads({ directory, version })).resolves.toEqual({
      artifacts,
      checksums: 3,
    });
  });

  it("rejects a missing platform artifact", async () => {
    const { artifacts, directory, version } = fixture();
    rmSync(join(directory, artifacts[0]!));

    await expect(verifyReleaseDownloads({ directory, version })).rejects.toThrow(
      "release download set is incomplete or contains unexpected files",
    );
  });

  it("rejects a changed artifact", async () => {
    const { artifacts, directory, version } = fixture();
    writeFileSync(join(directory, artifacts[1]!), "changed\n");

    await expect(verifyReleaseDownloads({ directory, version })).rejects.toThrow(
      `checksum does not match ${basename(artifacts[1]!)}`,
    );
  });

  it("rejects a deferred Windows artifact", async () => {
    const { directory, version } = fixture();
    writeFileSync(join(directory, `zd_${version}_x64-setup.exe`), "windows\n");

    await expect(verifyReleaseDownloads({ directory, version })).rejects.toThrow(
      "release download set is incomplete or contains unexpected files",
    );
  });
});
