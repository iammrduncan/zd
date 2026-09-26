import { createHash } from "node:crypto";
import console from "node:console";
import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

function expectedArtifacts(version) {
  return [`zd_${version}_arm64.dmg`, `zd_${version}_x86_64.dmg`, `zd_${version}_amd64.deb`];
}

function sameFiles(actual, expected) {
  return (
    actual.length === expected.length && actual.every((file, index) => file === expected[index])
  );
}

async function sha256(path) {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyChecksum(directory, artifact) {
  const checksumFile = `${artifact}.sha256`;
  const source = await readFile(join(directory, checksumFile), "utf8");
  const match = /^([0-9a-f]{64})[ ]{2}([^/\r\n]+)\r?\n?$/u.exec(source);
  if (!match || match[2] !== artifact) {
    throw new Error(`checksum file is malformed for ${artifact}`);
  }

  const actual = await sha256(join(directory, artifact));
  if (actual !== match[1]) {
    throw new Error(`checksum does not match ${artifact}`);
  }
}

export async function verifyReleaseDownloads({ directory, version }) {
  const artifacts = expectedArtifacts(version);
  const expected = [...artifacts, ...artifacts.map((artifact) => `${artifact}.sha256`)].sort();
  const actual = (await readdir(directory)).sort();
  if (!sameFiles(actual, expected)) {
    throw new Error(
      `release download set is incomplete or contains unexpected files: expected ${expected.join(", ")}; found ${actual.join(", ")}`,
    );
  }

  await Promise.all(artifacts.map((artifact) => verifyChecksum(directory, artifact)));
  return { artifacts, checksums: artifacts.length };
}

async function main() {
  if (process.argv.length !== 3) {
    console.error("usage: verify-downloads.mjs <download-directory>");
    process.exitCode = 2;
    return;
  }

  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const manifest = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const result = await verifyReleaseDownloads({
    directory: resolve(process.argv[2]),
    version: manifest.version,
  });
  console.log(
    `Verified ${result.artifacts.length} release artifacts and ${result.checksums} checksums`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
