#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { verifyLinuxInstallRoot } from "./linux-artifact.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactArgument = process.argv[2];
if (!artifactArgument || process.argv.length !== 3) {
  throw new Error("usage: inspect-linux-package.mjs <artifact.deb>");
}
const artifact = resolve(artifactArgument);
if (!artifact.endsWith(".deb")) throw new Error("Linux artifact must be a .deb file");

const expectedVersion = JSON.parse(
  await readFile(join(repositoryRoot, "package.json"), "utf8"),
).version;
const field = async (name) =>
  (
    await execFileAsync("dpkg-deb", ["--field", artifact, name], { encoding: "utf8" })
  ).stdout.trim();

if ((await field("Package")) !== "zd") throw new Error("Debian package name is not zd");
if ((await field("Version")) !== expectedVersion) {
  throw new Error("Debian package version does not match package.json");
}
if ((await field("Architecture")) !== "amd64") {
  throw new Error("Debian package architecture is not amd64");
}
const dependencies = await field("Depends");
for (const dependency of ["libwebkit2gtk-4.1-0", "libgtk-3-0"]) {
  if (
    !dependencies
      .split(",")
      .map((value) => value.trim())
      .includes(dependency)
  ) {
    throw new Error(`Debian package is missing dependency ${dependency}`);
  }
}

const installRoot = await mkdtemp(join(tmpdir(), "zd-linux-inspect-"));
const expectedPrefix = `${resolve(tmpdir())}${sep}zd-linux-inspect-`;
if (!resolve(installRoot).startsWith(expectedPrefix)) {
  throw new Error("Linux inspection root escaped the temporary directory");
}

try {
  await execFileAsync("dpkg-deb", ["--extract", artifact, installRoot]);
  const summary = await verifyLinuxInstallRoot({
    expectedAssets: join(repositoryRoot, "packages", "app", "dist"),
    forbiddenBuildPath: repositoryRoot,
    installRoot,
  });
  const artifactBytes = (await stat(artifact)).size;
  const sha256 = createHash("sha256")
    .update(await readFile(artifact))
    .digest("hex");
  process.stdout.write(
    `Verified ${basename(artifact)}: version=${expectedVersion} architecture=amd64 ` +
      `executables=${summary.executables.length} assets=${summary.assetFiles} ` +
      `assetBytes=${summary.assetBytes} artifactBytes=${artifactBytes} sha256=${sha256}\n`,
  );
} finally {
  await rm(installRoot, { recursive: true, force: true });
}
