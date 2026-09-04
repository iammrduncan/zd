#!/usr/bin/env node

import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { verifyLinuxInstallRoot } from "./linux-artifact.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryDirectory = resolve(tmpdir());
const packageName = "zd";
const staleRelativePath = "usr/lib/zd/assets/stale-package-owned.txt";
const markers = [
  ["home/zd-smoke/project/keep.md", "project data survives package removal\n"],
  [
    "home/com.zensuite.zd/keep.state",
    "application state survives package removal\n",
  ],
];

async function installRootFrom(argument) {
  const requested = resolve(argument);
  let metadata;
  try {
    metadata = await lstat(requested);
  } catch {
    throw new Error("Linux package lifecycle root is not an expected temporary directory");
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Linux package lifecycle root is not an expected temporary directory");
  }
  const root = await realpath(requested);
  if (
    dirname(root) !== temporaryDirectory ||
    !/^zd-linux-install\.[A-Za-z0-9]{6}$/u.test(basename(root))
  ) {
    throw new Error("Linux package lifecycle root is not an expected temporary directory");
  }
  return root;
}

function pathBelow(root, relativePath) {
  const path = resolve(root, relativePath);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error("Linux package lifecycle path escaped its temporary root");
  }
  return path;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (cause) {
    if (cause?.code === "ENOENT") return false;
    throw cause;
  }
}

async function run(command, argumentsList, failure) {
  try {
    await execFileAsync(command, argumentsList, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    throw new Error(failure);
  }
}

function dpkgArguments(root, action, ...values) {
  return [
    `--root=${root}`,
    "--force-not-root,depends",
    `--log=${join(root, "var", "log", "dpkg.log")}`,
    action,
    ...values,
  ];
}

async function writeMarkers(root) {
  for (const [relativePath, contents] of markers) {
    const path = pathBelow(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, "utf8");
  }
}

async function verifyMarkers(root) {
  for (const [relativePath, contents] of markers) {
    if ((await readFile(pathBelow(root, relativePath), "utf8")) !== contents) {
      throw new Error("Linux package lifecycle changed preserved user data");
    }
  }
}

async function buildPredecessor(artifact) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "zd-linux-predecessor-"));
  if (
    dirname(temporaryRoot) !== temporaryDirectory ||
    !/^zd-linux-predecessor-[A-Za-z0-9]{6}$/u.test(basename(temporaryRoot))
  ) {
    throw new Error("Linux predecessor root escaped the temporary directory");
  }
  const packageRoot = join(temporaryRoot, "root");
  const predecessor = join(temporaryRoot, "zd-predecessor.deb");
  try {
    await run(
      "dpkg-deb",
      ["--raw-extract", artifact, packageRoot],
      "Linux predecessor extraction failed",
    );
    const controlPath = join(packageRoot, "DEBIAN", "control");
    const control = await readFile(controlPath, "utf8");
    if (!/^Version: \S+$/mu.test(control)) {
      throw new Error("Linux package control version is missing");
    }
    await writeFile(
      controlPath,
      control.replace(/^Version: (\S+)$/mu, "Version: $1~smoke-predecessor"),
      "utf8",
    );
    await rm(join(packageRoot, "DEBIAN", "md5sums"), { force: true });
    const stalePath = join(packageRoot, staleRelativePath);
    await mkdir(dirname(stalePath), { recursive: true });
    await writeFile(stalePath, "obsolete package-owned asset\n", "utf8");
    await run(
      "dpkg-deb",
      ["--build", packageRoot, predecessor],
      "Linux predecessor package build failed",
    );
    return { predecessor, temporaryRoot };
  } catch (cause) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw cause;
  }
}

async function prepare(artifactArgument, rootArgument) {
  const artifact = resolve(artifactArgument);
  if (!artifact.endsWith(".deb") || !(await exists(artifact))) {
    throw new Error("Linux package lifecycle requires a Debian artifact");
  }
  const root = await installRootFrom(rootArgument);
  await Promise.all([
    mkdir(join(root, "var", "lib", "dpkg", "updates"), { recursive: true }),
    mkdir(join(root, "var", "lib", "dpkg", "info"), { recursive: true }),
    mkdir(join(root, "var", "log"), { recursive: true }),
  ]);
  await writeFile(join(root, "var", "lib", "dpkg", "status"), "", "utf8");
  await writeMarkers(root);

  const { predecessor, temporaryRoot } = await buildPredecessor(artifact);
  try {
    await run(
      "dpkg",
      dpkgArguments(root, "--install", predecessor),
      "Linux predecessor installation failed",
    );
    const stalePath = pathBelow(root, staleRelativePath);
    if (!(await exists(stalePath))) {
      throw new Error("Linux predecessor did not install its stale package-owned file");
    }
    await run("dpkg", dpkgArguments(root, "--install", artifact), "Linux package upgrade failed");
    if (await exists(stalePath)) {
      throw new Error("Linux package upgrade retained a stale package-owned file");
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const summary = await verifyLinuxInstallRoot({
    expectedAssets: join(repositoryRoot, "packages", "app", "dist"),
    installRoot: root,
  });
  await verifyMarkers(root);
  process.stdout.write(
    "Verified installed Linux package: install=passed upgrade=passed stale=removed " +
      `executables=${summary.executables.length} assets=${summary.assetFiles}\n`,
  );
}

async function installedPackageFiles(root) {
  const listing = await readFile(
    join(root, "var", "lib", "dpkg", "info", `${packageName}.list`),
    "utf8",
  );
  const files = [];
  for (const listedPath of listing.split(/\r?\n/u).filter(Boolean)) {
    const path = pathBelow(root, listedPath.replace(/^\/+/, ""));
    try {
      if (!(await lstat(path)).isDirectory()) files.push(path);
    } catch (cause) {
      if (cause?.code !== "ENOENT") throw cause;
    }
  }
  if (files.length === 0) throw new Error("Linux installed package file list is empty");
  return files;
}

async function removeInstalled(rootArgument) {
  const root = await installRootFrom(rootArgument);
  const installedFiles = await installedPackageFiles(root);
  await run("dpkg", dpkgArguments(root, "--remove", packageName), "Linux package removal failed");
  for (const path of installedFiles) {
    if (await exists(path)) throw new Error("Linux package removal retained a package-owned file");
  }
  await verifyMarkers(root);
  process.stdout.write(
    "Verified removed Linux package: package-files=removed user-data=preserved\n",
  );
}

async function main() {
  const [operation, ...argumentsList] = process.argv.slice(2);
  if (operation === "prepare" && argumentsList.length === 2) {
    await prepare(argumentsList[0], argumentsList[1]);
    return;
  }
  if (operation === "remove" && argumentsList.length === 1) {
    await removeInstalled(argumentsList[0]);
    return;
  }
  throw new Error(
    "usage: linux-install-lifecycle.mjs prepare <artifact.deb> <install-root> | remove <install-root>",
  );
}

try {
  await main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : "Linux package lifecycle failed";
  process.stderr.write(`zd: ${message}\n`);
  process.exitCode = 1;
}
