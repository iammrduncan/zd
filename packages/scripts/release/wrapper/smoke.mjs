#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

const STARTUP_TIMEOUT_MS = 20_000;
const EXIT_TIMEOUT_MS = 12_000;
const GRACEFUL_CLOSE_MAX_MS = 4_500;
const FORCED_CLOSE_MIN_MS = 4_500;
const FORCED_CLOSE_MAX_MS = 8_000;

function safeStage(value) {
  return [
    "shell-action",
    "retired-authority",
    "invalid-checkpoint",
    "host-not-ready",
    "missing-session",
    "unexpected-reload",
    "reload-replaced-host",
    "unexpected-crash-presentation",
    "checkpoint-after-finish",
    "missing-window",
    "reload-command",
    "close-trigger-timeout",
    "close-trigger-thread",
  ].includes(value)
    ? value
    : "unknown";
}

export function parseSmokeReport(source, expectedPhase) {
  const records = source
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        const record = JSON.parse(line);
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error();
        return record;
      } catch {
        throw new Error("installed wrapper smoke report is invalid");
      }
    });
  const failed = records.find((record) => record.phase === "failed");
  if (failed) {
    throw new Error(`installed wrapper smoke failed at ${safeStage(failed.stage)}`);
  }
  const record = records.findLast((candidate) => candidate.phase === expectedPhase);
  if (!record) throw new Error(`installed wrapper smoke report is missing phase ${expectedPhase}`);
  if (
    expectedPhase === "ready" &&
    (record.controller !== "one" ||
      record.shell !== "show-workbench" ||
      record.retiredAuthority !== "absent")
  ) {
    throw new Error("installed wrapper smoke did not prove one controller and shell boundary");
  }
  if (
    expectedPhase === "reloaded" &&
    (record.sameGeneration !== true || record.sameSession !== true)
  ) {
    throw new Error("installed wrapper smoke did not retain the same host session");
  }
  if (!["ready", "reloaded", "crash-presented"].includes(expectedPhase)) {
    throw new Error("installed wrapper smoke requested an invalid phase");
  }
  return record;
}

export function retainedHostObservation(expectedPid, observedPid) {
  return observedPid === undefined ? undefined : observedPid === expectedPid;
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

async function reportAt(path, phase) {
  try {
    const source = await readFile(path, "utf8");
    return source.endsWith("\n") ? parseSmokeReport(source, phase) : undefined;
  } catch (cause) {
    if (cause?.code === "ENOENT" || cause?.message?.includes("missing phase")) return undefined;
    throw cause;
  }
}

function waitForExit(child, timeoutMs = EXIT_TIMEOUT_MS) {
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
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child))) throw new Error("installed wrapper process did not exit");
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

async function health(port) {
  const response = await globalThis.fetch(`http://127.0.0.1:${port}/healthz`, {
    signal: globalThis.AbortSignal.timeout(2_000),
  });
  if (response.status !== 204) throw new Error("installed desktop host health check failed");
}

async function startScenario(options, scenario) {
  const report = join(options.smokeRoot, `${scenario}.jsonl`);
  const trigger = join(options.smokeRoot, `${scenario}.trigger`);
  await Promise.all([rm(report, { force: true }), rm(trigger, { force: true })]);
  const environment = {
    ...options.environmentFor(scenario),
    ZD_INSTALLED_SMOKE_SCENARIO: scenario,
    ZD_INSTALLED_SMOKE_REPORT: report,
    ZD_INSTALLED_SMOKE_TRIGGER: trigger,
  };
  const child = spawn(options.desktopPath, [options.projectOne], {
    env: environment,
    stdio: "ignore",
  });
  return { child, environment, report, trigger };
}

async function processState(options, primary, expectedPhase) {
  const hostPid = await waitUntil(
    () => options.directHostChild(primary.pid),
    "installed desktop did not start one zd host child",
  );
  const port = await waitUntil(
    () => options.listenerFor(hostPid),
    "installed desktop host did not open one loopback listener",
  );
  await waitUntil(
    () => reportAt(expectedPhase.report, expectedPhase.phase),
    `installed wrapper did not report ${expectedPhase.phase}`,
  );
  await health(port);
  return { hostPid, port };
}

async function requireOnePair(options) {
  await waitUntil(async () => {
    const counts = await options.installedCounts();
    return counts.host === 1 && counts.desktop === 1;
  }, "installed wrapper did not retain one desktop and one host");
}

async function requireSameHost(options, primaryPid, expectedPid) {
  await waitUntil(async () => {
    const retained = retainedHostObservation(
      expectedPid,
      await options.directHostChild(primaryPid),
    );
    if (retained === false) {
      throw new Error("secondary installed launch replaced the desktop host");
    }
    return retained;
  }, "secondary installed launch did not retain an observable desktop host");
}

async function requireNoProcesses(options) {
  await waitUntil(async () => {
    const counts = await options.installedCounts();
    return counts.console === 0 && counts.desktop === 0;
  }, "installed wrapper left an executable running");
}

async function closeFromTrigger(scenario, expectedMaximum) {
  const started = Date.now();
  await writeFile(scenario.trigger, "close\n", { flag: "wx" });
  if (!(await waitForExit(scenario.child))) {
    throw new Error("installed wrapper did not exit after its close trigger");
  }
  if (scenario.child.exitCode !== 0) throw new Error("installed wrapper close was unsuccessful");
  const elapsed = Date.now() - started;
  if (elapsed > expectedMaximum) throw new Error("installed wrapper close exceeded its bound");
  return elapsed;
}

async function runNormal(options) {
  const scenario = await startScenario(options, "normal");
  let secondary = null;
  let hostPid;
  let port;
  try {
    ({ hostPid, port } = await processState(options, scenario.child, {
      report: scenario.report,
      phase: "reloaded",
    }));
    await requireOnePair(options);
    secondary = spawn(options.consolePath, [options.projectTwo], {
      env: scenario.environment,
      stdio: "ignore",
    });
    if (!(await waitForExit(secondary)) || secondary.exitCode !== 0) {
      throw new Error("secondary installed launch did not return successfully");
    }
    await requireOnePair(options);
    await requireSameHost(options, scenario.child.pid, hostPid);
    await closeFromTrigger(scenario, GRACEFUL_CLOSE_MAX_MS);
    await requireNoProcesses(options);
    await proveReusablePort(port);
  } finally {
    await stop(secondary);
    await stop(scenario.child);
    if (hostPid && options.running(hostPid)) {
      process.kill(hostPid, "SIGKILL");
    }
  }
}

async function runForced(options) {
  const scenario = await startScenario(options, "forced");
  let hostPid;
  let port;
  try {
    ({ hostPid, port } = await processState(options, scenario.child, {
      report: scenario.report,
      phase: "ready",
    }));
    await requireOnePair(options);
    process.kill(hostPid, "SIGSTOP");
    const elapsed = await closeFromTrigger(scenario, FORCED_CLOSE_MAX_MS);
    if (elapsed < FORCED_CLOSE_MIN_MS) {
      throw new Error("installed wrapper did not exercise its forced shutdown deadline");
    }
    await requireNoProcesses(options);
    await proveReusablePort(port);
  } finally {
    if (hostPid && options.running(hostPid)) {
      process.kill(hostPid, "SIGCONT");
      process.kill(hostPid, "SIGKILL");
    }
    await stop(scenario.child);
  }
}

async function runCrash(options) {
  const scenario = await startScenario(options, "crash");
  let hostPid;
  let port;
  try {
    ({ hostPid, port } = await processState(options, scenario.child, {
      report: scenario.report,
      phase: "ready",
    }));
    await requireOnePair(options);
    process.kill(hostPid, "SIGKILL");
    await waitUntil(
      () => reportAt(scenario.report, "crash-presented"),
      "installed wrapper did not present its child crash",
    );
    if (!(await waitForExit(scenario.child)) || scenario.child.exitCode !== 0) {
      throw new Error("installed wrapper did not close after crash presentation");
    }
    await requireNoProcesses(options);
    await proveReusablePort(port);
  } finally {
    if (hostPid && options.running(hostPid)) process.kill(hostPid, "SIGKILL");
    await stop(scenario.child);
  }
}

export async function runInstalledWrapperSmoke(options) {
  await runNormal(options);
  await runForced(options);
  await runCrash(options);
}
