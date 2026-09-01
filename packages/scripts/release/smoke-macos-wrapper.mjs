#!/usr/bin/env node

import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { promisify } from "node:util";

import { parseLsofListeners, parseProcessTable } from "./macos-process.mjs";

const execFileAsync = promisify(execFile);
const STARTUP_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;
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
await Promise.all([mkdir(projectOne), mkdir(projectTwo), mkdir(stateRoot)]);
await writeFile(join(projectOne, "notes.md"), "installed wrapper smoke\n");
const environment = { ...process.env, HOME: stateRoot };
let primary = null;

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolveExit(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, EXIT_TIMEOUT_MS)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child, EXIT_TIMEOUT_MS))) {
    throw new Error("installed macOS wrapper process did not exit");
  }
}

async function waitUntil(check, message) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await check();
    if (result !== undefined && result !== false) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(message);
}

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

async function oneInstalledPair() {
  const table = await processes();
  return (
    table.filter((entry) => commandUses(entry.command, desktopPath)).length === 1 &&
    table.filter((entry) => commandUses(entry.command, consolePath)).length === 1
  );
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

function proveReusablePort(port) {
  return new Promise((resolveProof, rejectProof) => {
    const server = createServer();
    server.once("error", rejectProof);
    server.listen(port, "127.0.0.1", () => {
      server.close((problem) => (problem ? rejectProof(problem) : resolveProof()));
    });
  });
}

try {
  primary = spawn(desktopPath, [projectOne], { env: environment, stdio: "ignore" });
  const hostPid = await waitUntil(
    () => directHostChild(primary.pid),
    "installed macOS desktop did not start one zd host child",
  );
  const listener = await waitUntil(
    () => listenerFor(hostPid),
    "installed macOS desktop host did not open one loopback listener",
  );
  const health = await globalThis.fetch(`http://127.0.0.1:${listener}/healthz`, {
    signal: globalThis.AbortSignal.timeout(2_000),
  });
  if (health.status !== 204) throw new Error("installed macOS desktop host health check failed");

  const secondary = spawn(consolePath, [projectTwo], { env: environment, stdio: "ignore" });
  if (!(await waitForExit(secondary, EXIT_TIMEOUT_MS)) || secondary.exitCode !== 0) {
    await stop(secondary);
    throw new Error("secondary installed macOS launch did not return successfully");
  }
  await waitUntil(oneInstalledPair, "secondary installed macOS launch left a duplicate process");
  if ((await directHostChild(primary.pid)) !== hostPid) {
    throw new Error("secondary installed macOS launch replaced the desktop host");
  }

  await stop(primary);
  primary = null;
  await waitUntil(
    async () => !(await processes()).some((entry) => entry.pid === hostPid),
    "installed macOS host remained after desktop exit",
  );
  await proveReusablePort(listener);
  process.stdout.write("Verified installed macOS wrapper\n");
} finally {
  if (primary) await stop(primary);
  await rm(smokeRoot, { recursive: true, force: true });
}
