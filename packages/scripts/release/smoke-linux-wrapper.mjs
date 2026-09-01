#!/usr/bin/env node

import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import process from "node:process";

import { parseParentPid, parseTcpListeners } from "./linux-process.mjs";
import { runInstalledWrapperSmoke } from "./wrapper/smoke.mjs";

const installArgument = process.argv[2];
if (!installArgument || process.argv.length !== 3) {
  throw new Error("usage: smoke-linux-wrapper.mjs <extracted-install-root>");
}
if (!process.env.DISPLAY) throw new Error("Linux wrapper smoke requires an X display");

const installRoot = resolve(installArgument);
const consolePath = join(installRoot, "usr", "bin", "zd");
const desktopPath = join(installRoot, "usr", "bin", "zd-desktop");
if (basename(consolePath) !== "zd" || basename(desktopPath) !== "zd-desktop") {
  throw new Error("installed executable paths are invalid");
}
const [canonicalConsole, canonicalDesktop] = await Promise.all([
  realpath(consolePath),
  realpath(desktopPath),
]);
const smokeRoot = await mkdtemp(join(tmpdir(), "zd-linux-wrapper-"));
const expectedPrefix = `${resolve(tmpdir())}${sep}zd-linux-wrapper-`;
if (!resolve(smokeRoot).startsWith(expectedPrefix)) {
  throw new Error("Linux wrapper smoke root escaped the temporary directory");
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

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (cause.code === "ESRCH") return false;
    throw cause;
  }
}

async function executableForPid(pid) {
  try {
    return await realpath(`/proc/${pid}/exe`);
  } catch {
    return null;
  }
}

async function directHostChild(parentPid) {
  for (const pid of await pidsForExecutable(canonicalConsole)) {
    try {
      const status = await readFile(`/proc/${pid}/status`, "utf8");
      if (parseParentPid(status) === parentPid) return pid;
    } catch {
      // The candidate may exit while its parent is inspected.
    }
  }
  return undefined;
}

async function pidsForExecutable(executable) {
  const pids = [];
  for (const entry of await readdir("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue;
    const pid = Number(entry.name);
    if ((await executableForPid(pid)) === executable) pids.push(pid);
  }
  return pids.sort((left, right) => left - right);
}

async function socketInodes(pid) {
  const inodes = new Set();
  for (const entry of await readdir(`/proc/${pid}/fd`)) {
    try {
      const target = await readlink(`/proc/${pid}/fd/${entry}`);
      const match = /^socket:\[(\d+)\]$/u.exec(target);
      if (match) inodes.add(match[1]);
    } catch {
      // Descriptors may close while they are inspected.
    }
  }
  return inodes;
}

async function listenerFor(pid) {
  const listeners = parseTcpListeners(
    await readFile("/proc/net/tcp", "utf8"),
    await socketInodes(pid),
  );
  return listeners.length === 1 ? listeners[0] : undefined;
}

async function installedCounts() {
  const [consolePids, desktopPids] = await Promise.all([
    pidsForExecutable(canonicalConsole),
    pidsForExecutable(canonicalDesktop),
  ]);
  return { console: consolePids.length, desktop: desktopPids.length };
}

try {
  await runInstalledWrapperSmoke({
    smokeRoot,
    desktopPath,
    consolePath,
    projectOne,
    projectTwo,
    environmentFor: (scenario) => ({
      ...process.env,
      XDG_CONFIG_HOME: join(stateRoot, scenario),
    }),
    directHostChild,
    listenerFor,
    installedCounts,
    running,
  });
  process.stdout.write("Verified installed Linux wrapper lifecycle\n");
} finally {
  await rm(smokeRoot, { recursive: true, force: true });
}
