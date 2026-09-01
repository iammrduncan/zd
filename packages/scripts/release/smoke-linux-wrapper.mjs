#!/usr/bin/env node

import { spawn } from "node:child_process";
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
import { createServer } from "node:net";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

import { parseParentPid, parseTcpListeners } from "./linux-process.mjs";

const STARTUP_TIMEOUT_MS = 15_000;
const EXIT_TIMEOUT_MS = 10_000;
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
await Promise.all([mkdir(projectOne), mkdir(projectTwo), mkdir(stateRoot)]);
await writeFile(join(projectOne, "notes.md"), "installed wrapper smoke\n");

const environment = {
  ...process.env,
  XDG_CONFIG_HOME: stateRoot,
};
let primary = null;

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (cause.code === "ESRCH") return false;
    throw cause;
  }
}

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
    throw new Error("installed wrapper process did not exit");
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
  const startedAt = Date.now();
  primary = spawn(desktopPath, [projectOne], {
    env: environment,
    stdio: "ignore",
  });
  const hostPid = await waitUntil(
    () => directHostChild(primary.pid),
    "installed desktop did not start one zd host child",
  );
  const listener = await waitUntil(
    () => listenerFor(hostPid),
    "installed desktop host did not open one loopback listener",
  );
  const health = await globalThis.fetch(`http://127.0.0.1:${listener}/healthz`, {
    signal: globalThis.AbortSignal.timeout(2_000),
  });
  if (health.status !== 204) throw new Error("installed desktop host health check failed");

  const secondary = spawn(consolePath, [projectTwo], { env: environment, stdio: "ignore" });
  if (!(await waitForExit(secondary, EXIT_TIMEOUT_MS)) || secondary.exitCode !== 0) {
    await stop(secondary);
    throw new Error("secondary installed zd launch did not return successfully");
  }
  await waitUntil(async () => {
    const [consolePids, desktopPids] = await Promise.all([
      pidsForExecutable(canonicalConsole),
      pidsForExecutable(canonicalDesktop),
    ]);
    return consolePids.length === 1 && desktopPids.length === 1;
  }, "secondary installed launch left a duplicate process");
  if ((await directHostChild(primary.pid)) !== hostPid) {
    throw new Error("secondary installed launch replaced the desktop host");
  }

  await stop(primary);
  primary = null;
  await waitUntil(() => !running(hostPid), "installed host remained after desktop exit");
  await proveReusablePort(listener);
  process.stdout.write(
    `Verified installed Linux wrapper: hostPid=${hostPid} health=204 secondary=reused ` +
      `cleanup=passed durationMs=${Date.now() - startedAt}\n`,
  );
} finally {
  if (primary) await stop(primary);
  await rm(smokeRoot, { recursive: true, force: true });
}
