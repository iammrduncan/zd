#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { regularFilesUnder } from "./frontend-artifact.mjs";
import { verifyMacosAppBundle } from "./macos-artifact.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const appArgument = process.argv[2];
if (!appArgument || process.argv.length !== 3) {
  throw new Error("usage: inspect-macos-app.mjs <zd.app>");
}
if (process.platform !== "darwin") throw new Error("macOS app inspection requires macOS");
const appPath = resolve(appArgument);
if (!appPath.endsWith(".app")) throw new Error("macOS artifact must be an .app bundle");

const summary = await verifyMacosAppBundle({
  appPath,
  expectedAssets: join(repositoryRoot, "packages", "app", "dist"),
});
const plist = join(appPath, "Contents", "Info.plist");
const plistField = async (name, format = "raw") =>
  (
    await execFileAsync("plutil", ["-extract", name, format, "-o", "-", plist], {
      encoding: "utf8",
    })
  ).stdout.trim();
if ((await plistField("CFBundleExecutable")) !== "zd-desktop") {
  throw new Error("macOS bundle executable is not zd-desktop");
}
const documentTypes = JSON.parse(await plistField("CFBundleDocumentTypes", "json"));
const markdownAssociation = documentTypes.some(
  (entry) =>
    entry.CFBundleTypeRole === "Editor" &&
    ["md", "markdown"].every((extension) =>
      (entry.CFBundleTypeExtensions ?? []).includes(extension),
    ),
);
if (!markdownAssociation) throw new Error("macOS Markdown file association is missing");

const expectedArchitecture = process.arch === "arm64" ? "arm64" : "x86_64";
for (const executable of [
  join(appPath, "Contents", "MacOS", "zd-desktop"),
  join(appPath, "Contents", "Resources", "bin", "zd"),
]) {
  const architectures = (
    await execFileAsync("lipo", ["-archs", executable], { encoding: "utf8" })
  ).stdout
    .trim()
    .split(/\s+/u);
  if (architectures.length !== 1 || architectures[0] !== expectedArchitecture) {
    throw new Error("macOS executable architecture does not match the runner");
  }
}
await execFileAsync("codesign", ["--verify", "--deep", "--strict", appPath]);

const forbiddenBuildPath = Buffer.from(repositoryRoot);
for (const path of await regularFilesUnder(appPath)) {
  if ((await readFile(path)).includes(forbiddenBuildPath)) {
    throw new Error("macOS app contains an absolute build path");
  }
}
process.stdout.write(
  `Verified ${basename(appPath)}: architecture=${expectedArchitecture} ` +
    `executables=${summary.executables.length} assets=${summary.assetFiles} ` +
    `assetBytes=${summary.assetBytes} codesign=strict\n`,
);
