import { Buffer } from "node:buffer";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { regularFilesUnder, relativeFiles, verifyPackagedFrontend } from "./frontend-artifact.mjs";

async function executable(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || (metadata.mode & 0o111) === 0) throw new Error();
    return readFile(path);
  } catch {
    throw new Error("required macOS executable is missing");
  }
}

async function requiredNonemptyFile(path, message) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.size === 0) throw new Error();
  } catch {
    throw new Error(message);
  }
}

export async function verifyMacosAppBundle({ appPath, expectedAssets }) {
  const desktopPath = join(appPath, "Contents", "MacOS", "zd-desktop");
  const consolePath = join(appPath, "Contents", "Resources", "bin", "zd");
  const [desktopBytes, consoleBytes] = await Promise.all([
    executable(desktopPath),
    executable(consolePath),
  ]);
  if (desktopBytes.equals(consoleBytes)) {
    throw new Error("console and desktop executable roles are identical");
  }
  const developmentUrl = Buffer.from("http://localhost:1420");
  if (desktopBytes.includes(developmentUrl) || consoleBytes.includes(developmentUrl)) {
    throw new Error("release artifact contains a development server URL");
  }

  await requiredNonemptyFile(
    join(appPath, "Contents", "Info.plist"),
    "macOS application Info.plist is missing",
  );
  await requiredNonemptyFile(
    join(appPath, "Contents", "Resources", "icon.icns"),
    "macOS application icon is missing",
  );
  const installedFiles = relativeFiles(appPath, await regularFilesUnder(appPath));
  const frontendEntries = installedFiles.filter((path) => path.endsWith("/index.html"));
  if (
    frontendEntries.length !== 1 ||
    frontendEntries[0] !== "Contents/Resources/assets/index.html"
  ) {
    throw new Error("macOS package contains more than one frontend");
  }
  const assets = await verifyPackagedFrontend(
    expectedAssets,
    join(appPath, "Contents", "Resources", "assets"),
  );

  return {
    ...assets,
    executables: ["Contents/MacOS/zd-desktop", "Contents/Resources/bin/zd"],
  };
}
