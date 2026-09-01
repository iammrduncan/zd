import { Buffer } from "node:buffer";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const REQUIRED_DESKTOP_LINES = [
  "Exec=zd-desktop %F",
  "Icon=zd-desktop",
  "Terminal=false",
  "Type=Application",
  "MimeType=text/markdown;",
];
const FORBIDDEN_ASSET_TEXT = [
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "/@vite/client",
  "zd-served-e2e-",
  "Opened through the real Rust host.",
];

async function filesUnder(root) {
  const files = [];
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error("release frontend contains a non-file entry");
    }
  };
  await visit(root);
  return files;
}

function relativeFiles(root, files) {
  return files.map((path) => relative(root, path).split(sep).join("/"));
}

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

async function verifyAssets(expectedAssets, installedAssets) {
  const expectedFiles = await filesUnder(expectedAssets);
  const installedFiles = await filesUnder(installedAssets);
  const expectedRelative = relativeFiles(expectedAssets, expectedFiles);
  const installedRelative = relativeFiles(installedAssets, installedFiles);
  if (expectedRelative.some((path) => path.endsWith(".map"))) {
    throw new Error("release frontend contains a source map");
  }
  if (JSON.stringify(installedRelative) !== JSON.stringify(expectedRelative)) {
    throw new Error("packaged frontend assets differ from packages/app/dist");
  }

  let assetBytes = 0;
  for (let index = 0; index < expectedFiles.length; index += 1) {
    const expected = await readFile(expectedFiles[index]);
    const installed = await readFile(installedFiles[index]);
    if (!expected.equals(installed)) {
      throw new Error("packaged frontend assets differ from packages/app/dist");
    }
    for (const forbidden of FORBIDDEN_ASSET_TEXT) {
      if (expected.includes(Buffer.from(forbidden))) {
        throw new Error("release frontend contains a development or fixture reference");
      }
    }
    assetBytes += expected.length;
  }
  return { assetBytes, assetFiles: expectedFiles.length };
}

export async function verifyLinuxInstallRoot({ expectedAssets, installRoot }) {
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

  const binEntries = (await readdir(join(installRoot, "usr", "bin"))).sort();
  if (JSON.stringify(binEntries) !== JSON.stringify(["zd", "zd-desktop"])) {
    throw new Error("Linux package contains an unexpected executable");
  }
  await verifyDesktopEntry(join(installRoot, "usr", "share", "applications", "zd.desktop"));
  await verifyDesktopIcons(installRoot);
  const installedFiles = relativeFiles(installRoot, await filesUnder(installRoot));
  const frontendEntries = installedFiles.filter((path) => path.endsWith("/index.html"));
  if (frontendEntries.length !== 1 || frontendEntries[0] !== "usr/lib/zd/assets/index.html") {
    throw new Error("Linux package contains more than one frontend");
  }
  const assets = await verifyAssets(
    expectedAssets,
    join(installRoot, "usr", "lib", "zd", "assets"),
  );

  return {
    ...assets,
    executables: ["usr/bin/zd", "usr/bin/zd-desktop"],
  };
}
