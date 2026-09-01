import { Buffer } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const FORBIDDEN_ASSET_TEXT = [
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "/@vite/client",
  "zd-served-e2e-",
  "Opened through the real Rust host.",
];

export async function regularFilesUnder(root) {
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

export function relativeFiles(root, files) {
  return files.map((path) => relative(root, path).split(sep).join("/"));
}

export async function verifyPackagedFrontend(expectedAssets, installedAssets) {
  const expectedFiles = await regularFilesUnder(expectedAssets);
  const installedFiles = await regularFilesUnder(installedAssets);
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
