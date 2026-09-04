import { Buffer } from "node:buffer";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { regularFilesUnder, relativeFiles, verifyPackagedFrontend } from "./frontend-artifact.mjs";

const REQUIRED_DESKTOP_LINES = [
  "Exec=zd-desktop %F",
  "Icon=zd-desktop",
  "Terminal=false",
  "Type=Application",
  "MimeType=text/markdown;",
];
async function verifyExecutable(path) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new Error("required executable is missing");
  }
  if (!metadata.isFile() || (metadata.mode & 0o111) === 0) {
    throw new Error("required executable is not a runnable regular file");
  }
  return readFile(path);
}

async function verifyDesktopEntry(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new Error("Linux desktop entry is missing");
  }
  for (const line of REQUIRED_DESKTOP_LINES) {
    if (!source.split(/\r?\n/u).includes(line)) {
      if (line === "Exec=zd-desktop %F") {
        throw new Error("desktop entry must launch zd-desktop %F");
      }
      throw new Error(`desktop entry is missing ${line}`);
    }
  }
}

async function verifyDesktopIcons(installRoot) {
  for (const size of ["32x32", "128x128", "256x256@2"]) {
    const path = join(
      installRoot,
      "usr",
      "share",
      "icons",
      "hicolor",
      size,
      "apps",
      "zd-desktop.png",
    );
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.size === 0) throw new Error();
    } catch {
      throw new Error("required Linux desktop icon is missing");
    }
  }
}

export async function verifyLinuxInstallRoot({
  expectedAssets,
  forbiddenBuildPath,
  installRoot,
}) {
  if (typeof forbiddenBuildPath !== "string" || forbiddenBuildPath.length === 0) {
    throw new Error("Linux build path check is required");
  }
  const consolePath = join(installRoot, "usr", "bin", "zd");
  const desktopPath = join(installRoot, "usr", "bin", "zd-desktop");
  const [consoleBytes, desktopBytes] = await Promise.all([
    verifyExecutable(consolePath),
    verifyExecutable(desktopPath),
  ]);
  if (consoleBytes.equals(desktopBytes)) {
    throw new Error("console and desktop executable roles are identical");
  }
  const developmentUrl = Buffer.from("http://localhost:1420");
  if (consoleBytes.includes(developmentUrl) || desktopBytes.includes(developmentUrl)) {
    throw new Error("release artifact contains a development server URL");
  }
  const buildPath = Buffer.from(forbiddenBuildPath);
  if (consoleBytes.includes(buildPath) || desktopBytes.includes(buildPath)) {
    throw new Error("Linux package contains an absolute build path");
  }

  const binEntries = (await readdir(join(installRoot, "usr", "bin"))).sort();
  if (JSON.stringify(binEntries) !== JSON.stringify(["zd", "zd-desktop"])) {
    throw new Error("Linux package contains an unexpected executable");
  }
  await verifyDesktopEntry(join(installRoot, "usr", "share", "applications", "zd.desktop"));
  await verifyDesktopIcons(installRoot);
  const installedFiles = relativeFiles(installRoot, await regularFilesUnder(installRoot));
  const frontendEntries = installedFiles.filter((path) => path.endsWith("/index.html"));
  if (frontendEntries.length !== 1 || frontendEntries[0] !== "usr/lib/zd/assets/index.html") {
    throw new Error("Linux package contains more than one frontend");
  }
  const assets = await verifyPackagedFrontend(
    expectedAssets,
    join(installRoot, "usr", "lib", "zd", "assets"),
  );

  return {
    ...assets,
    executables: ["usr/bin/zd", "usr/bin/zd-desktop"],
  };
}
