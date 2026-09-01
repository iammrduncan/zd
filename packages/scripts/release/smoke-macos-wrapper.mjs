#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { parseLsofListeners, parseProcessTable } from "./macos-process.mjs";
import { runInstalledWrapperSmoke } from "./wrapper/smoke.mjs";

const execFileAsync = promisify(execFile);
const appArgument = process.argv[2];
if (!appArgument || process.argv.length !== 3) {
  throw new Error("usage: smoke-macos-wrapper.mjs <installed-zd.app>");
}
if (process.platform !== "darwin") throw new Error("macOS wrapper smoke requires macOS");

const appPath = await realpath(resolve(appArgument));
const desktopPath = await realpath(join(appPath, "Contents", "MacOS", "zd-desktop"));
const consolePath = await realpath(join(appPath, "Contents", "Resources", "bin", "zd"));
const smokeRoot = await mkdtemp(join(tmpdir(), "zd-macos-wrapper-"));
const expectedPrefix = `${resolve(tmpdir())}${sep}zd-macos-wrapper-`;
if (!resolve(smokeRoot).startsWith(expectedPrefix)) {
  throw new Error("macOS wrapper smoke root escaped the temporary directory");
}
const projectOne = join(smokeRoot, "project-one");
const projectTwo = join(smokeRoot, "project-two");
const stateRoot = join(smokeRoot, "state");
await Promise.all([
  mkdir(projectOne),
  mkdir(projectTwo),
  ...["normal", "forced", "crash"].map((scenario) =>
    mkdir(join(stateRoot, scenario), { recursive: true }),
  ),
]);
await writeFile(join(projectOne, "notes.md"), "installed wrapper smoke\n");

async function processes() {
  const { stdout } = await execFileAsync("ps", ["-ww", "-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  });
  return parseProcessTable(stdout);
}

function commandUses(command, executable) {
  return command === executable || command.startsWith(`${executable} `);
}

async function directHostChild(parentPid) {
  return (await processes()).find(
    (processEntry) =>
      processEntry.parentPid === parentPid && commandUses(processEntry.command, consolePath),
  )?.pid;
}

async function installedCounts() {
  const table = await processes();
  return {
    desktop: table.filter((entry) => commandUses(entry.command, desktopPath)).length,
    console: table.filter((entry) => commandUses(entry.command, consolePath)).length,
  };
}

async function listenerFor(pid) {
  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"],
      { encoding: "utf8" },
    );
    const listeners = parseLsofListeners(stdout);
    return listeners.length === 1 ? listeners[0] : undefined;
  } catch {
    return undefined;
  }
}

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (cause.code === "ESRCH") return false;
    throw cause;
  }
}

try {
  await runInstalledWrapperSmoke({
    smokeRoot,
    desktopPath,
    consolePath,
    projectOne,
    projectTwo,
    environmentFor: (scenario) => ({ ...process.env, HOME: join(stateRoot, scenario) }),
    directHostChild,
    listenerFor,
    installedCounts,
    running,
  });
  process.stdout.write("Verified installed macOS wrapper lifecycle\n");
} finally {
  await rm(smokeRoot, { recursive: true, force: true });
}
