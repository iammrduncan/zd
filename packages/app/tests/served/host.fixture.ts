import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  resolveServedHostExecutable,
  servedHostEnvironment,
  servedHostStateDirectory,
} from "./runtime";

const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const FIXTURE_TEXT = "# Remote fixture\n\nOpened through the real Rust host.\n";
const execFileAsync = promisify(execFile);

interface ServedHostFixture {
  readonly url: string;
  readonly secret: string;
  readonly secondProjectName: string;
  restart(): Promise<Readiness>;
  createExternalFile(): Promise<void>;
  isProcessRunning(pid: number): boolean;
  readFixtureFile(): Promise<string>;
  readSecondProjectFile(): Promise<string>;
  readFixtureDocs(): Promise<readonly string[]>;
  readFixtureScreenshots(): Promise<readonly string[]>;
  readDiagnostics(): Promise<string>;
  readPersistedState(): Promise<string>;
}

interface Readiness {
  readonly url: string;
  readonly secret: string;
}

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function directIpv4Address(): string {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter(
      (entry) =>
        entry.family === "IPv4" &&
        !entry.internal &&
        entry.address !== "0.0.0.0" &&
        !entry.address.startsWith("169.254."),
    )
    .map((entry) => entry.address)
    .sort();
  const address = addresses[0];
  if (!address) {
    throw new Error("the served-host evidence target requires a non-loopback IPv4 address");
  }
  return address;
}

function validateReadiness(
  urlValue: string,
  secret: string,
  expectedHost: string,
): Readiness | null {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== expectedHost ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(secret)
  ) {
    return null;
  }
  return { url: url.toString(), secret };
}

function waitForReadiness(
  child: ReturnType<typeof spawn>,
  expectedHost: string,
): Promise<Readiness> {
  return new Promise((resolveReady, rejectReady) => {
    if (!child.stdout) {
      rejectReady(new Error("the served-host stdout pipe is unavailable"));
      return;
    }
    let buffered = "";
    let url = "";
    let secret = "";
    const finish = () => {
      const readiness = validateReadiness(url, secret, expectedHost);
      if (!readiness) return;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      child.stdout?.off("data", onData);
      child.stdout?.resume();
      resolveReady(readiness);
    };
    const onData = (chunk: Buffer | string) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/u);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("zd serve URL: ")) url = line.slice("zd serve URL: ".length);
        if (line.startsWith("zd serve secret: ")) {
          secret = line.slice("zd serve secret: ".length);
        }
      }
      finish();
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      child.off("error", onError);
      rejectReady(
        new Error(`the served host exited before readiness (${code ?? signal ?? "unknown"})`),
      );
    };
    const onError = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.stdout?.off("data", onData);
      rejectReady(new Error("the served-host test process could not start"));
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      child.off("error", onError);
      child.stdout?.off("data", onData);
      rejectReady(new Error("the served host did not provide bounded readiness in time"));
    }, STARTUP_TIMEOUT_MS);
    child.once("exit", onExit);
    child.once("error", onError);
    child.stdout.on("data", onData);
  });
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<boolean> {
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

async function stopHost(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill(process.platform === "win32" ? "SIGTERM" : "SIGINT");
  if (await waitForExit(child, SHUTDOWN_TIMEOUT_MS)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child, SHUTDOWN_TIMEOUT_MS))) {
    throw new Error("the served-host test process did not exit");
  }
}

function freeHostPort(host: string, excluding: number): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((problem) => {
        if (problem) rejectPort(problem);
        else if (port === 0 || port === excluding)
          void freeHostPort(host, excluding).then(resolvePort, rejectPort);
        else resolvePort(port);
      });
    });
  });
}

async function readTreeText(root: string): Promise<string> {
  const contents: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) contents.push(await readFile(path, "utf8"));
    }
  };
  await visit(root);
  return contents.join("\n");
}

async function runGit(root: string, ...args: readonly string[]): Promise<void> {
  await execFileAsync("git", args, {
    cwd: root,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

export async function disposeServedTerminals(
  page: Page,
  url: string,
  secret: string,
): Promise<void> {
  const documentUrl = new URL("/api/pair", url).toString();
  await page.goto(documentUrl);
  await page.evaluate(
    async ({ processSecret }) => {
      const endpoint = new URL("/api/host", window.location.origin);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(endpoint);
      const inbox: unknown[] = [];
      const waiters: Array<(message: unknown) => void> = [];
      socket.addEventListener("message", ({ data }) => {
        const message: unknown = JSON.parse(String(data));
        const waiter = waiters.shift();
        if (waiter) waiter(message);
        else inbox.push(message);
      });
      const receive = (): Promise<unknown> => {
        const queued = inbox.shift();
        return queued === undefined
          ? new Promise((resolveMessage) => waiters.push(resolveMessage))
          : Promise.resolve(queued);
      };
      const receiveType = async (
        type: string,
        requestId?: string,
      ): Promise<Record<string, unknown>> => {
        for (;;) {
          const message = (await receive()) as Record<string, unknown>;
          if (
            message.type === type &&
            (requestId === undefined || message.requestId === requestId)
          ) {
            return message;
          }
        }
      };
      await new Promise<void>((resolveOpen, rejectOpen) => {
        socket.addEventListener("open", () => resolveOpen(), { once: true });
        socket.addEventListener("error", () => rejectOpen(new Error("socket failed")), {
          once: true,
        });
      });
      socket.send(
        JSON.stringify({
          protocolVersion: 1,
          type: "authenticate",
          secret: processSecret,
        }),
      );
      await receiveType("authenticated");
      let sequence = 0;
      const request = async <Result>(method: string, params: object): Promise<Result> => {
        const requestId = `cleanup-${++sequence}`;
        socket.send(
          JSON.stringify({
            protocolVersion: 1,
            type: "request",
            requestId,
            method,
            params,
          }),
        );
        const response = await receiveType("response", requestId);
        if (response.error !== undefined) throw new Error("terminal cleanup failed");
        return response.result as Result;
      };
      const snapshot = await request<{
        terminals: Array<{
          session: { sessionId: string; projectId: string; worktreeId: string };
        }>;
      }>("session.snapshot", {});
      for (const terminal of snapshot.terminals) {
        await request("terminal.dispose", { session: terminal.session });
      }
      await new Promise<void>((resolveClose) => {
        socket.addEventListener("close", () => resolveClose(), { once: true });
        socket.close();
      });
    },
    { processSecret: secret },
  );
}

export const test = base.extend<object, { servedHost: ServedHostFixture }>({
  servedHost: [
    async ({ browser, browserName }, use) => {
      if (browserName !== "chromium") {
        throw new Error("the served-host evidence target requires Chromium");
      }
      const root = repositoryRoot();
      const executable = resolveServedHostExecutable({
        environment: process.env,
        platform: process.platform,
        repositoryRoot: root,
      });
      const hostAddress = directIpv4Address();
      const fixtureRoot = await mkdtemp(join(tmpdir(), "zd-served-e2e-"));
      const projectRoot = join(fixtureRoot, "startup");
      const secondProjectRoot = join(fixtureRoot, "second");
      const stateRoot = await mkdtemp(join(tmpdir(), "zd-served-state-e2e-"));
      const expectedPrefix = `${resolve(tmpdir())}${sep}zd-served-e2e-`;
      const expectedStatePrefix = `${resolve(tmpdir())}${sep}zd-served-state-e2e-`;
      if (!resolve(fixtureRoot).startsWith(expectedPrefix)) {
        throw new Error("the served-host fixture root escaped the temporary directory");
      }
      if (!resolve(stateRoot).startsWith(expectedStatePrefix)) {
        throw new Error("the served-host state root escaped the temporary directory");
      }
      const hostStateRoot = servedHostStateDirectory(process.env, stateRoot, process.platform);
      let child: ReturnType<typeof spawn> | null = null;
      let readiness: Readiness | null = null;
      const currentReadiness = (): Readiness | null => readiness;

      const startHost = async (port: number): Promise<Readiness> => {
        const launched = spawn(
          executable,
          ["serve", projectRoot, "--bind", hostAddress, "--port", String(port)],
          {
            cwd: root,
            env: servedHostEnvironment(process.env, stateRoot, process.platform),
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        launched.stderr?.resume();
        try {
          const ready = await waitForReadiness(launched, hostAddress);
          child = launched;
          readiness = ready;
          return ready;
        } catch (cause) {
          await stopHost(launched);
          throw cause;
        }
      };

      try {
        await mkdir(projectRoot);
        await mkdir(secondProjectRoot);
        await Promise.all(
          Array.from({ length: 48 }, (_, index) =>
            mkdir(join(fixtureRoot, `picker-folder-${String(index + 1).padStart(2, "0")}`)),
          ),
        );
        await mkdir(join(projectRoot, "docs"));
        await writeFile(join(projectRoot, "notes.md"), FIXTURE_TEXT, "utf8");
        await writeFile(join(projectRoot, "docs", "inside.md"), "inside\n", "utf8");
        await writeFile(
          join(secondProjectRoot, "second.md"),
          "# Second remote project\n\nOpened from the remote folder browser.\n",
          "utf8",
        );
        const builtInTheme = await readFile(
          join(root, "packages", "app", "src", "design", "themes", "builtins", "dark.theme.config"),
          "utf8",
        );
        const fixtureTheme = builtInTheme.replace('"name": "Dark"', '"name": "Served Fixture"');
        if (fixtureTheme === builtInTheme) {
          throw new Error("the served-host fixture could not derive its valid theme");
        }
        await mkdir(hostStateRoot, { recursive: true });
        await writeFile(join(hostStateRoot, "served.theme.config"), fixtureTheme, "utf8");
        await runGit(projectRoot, "init", "--initial-branch=main");
        await runGit(projectRoot, "config", "user.name", "Served Fixture");
        await runGit(projectRoot, "config", "user.email", "served-fixture@example.invalid");
        await runGit(projectRoot, "add", "--", "notes.md", "docs/inside.md");
        await runGit(projectRoot, "commit", "-m", "Initial served fixture");
        await startHost(0);
        await use({
          get url() {
            if (!readiness) throw new Error("the served host is not running");
            return readiness.url;
          },
          get secret() {
            if (!readiness) throw new Error("the served host is not running");
            return readiness.secret;
          },
          secondProjectName: basename(secondProjectRoot),
          restart: async () => {
            if (!child || !readiness) throw new Error("the served host is not running");
            const oldPort = new URL(readiness.url).port;
            await stopHost(child);
            child = null;
            readiness = null;
            const port = await freeHostPort(hostAddress, Number(oldPort));
            const restarted = await startHost(port);
            if (new URL(restarted.url).port === oldPort) {
              throw new Error("the served host restart reused its previous port");
            }
            return restarted;
          },
          createExternalFile: () =>
            writeFile(
              join(projectRoot, "external-watch.md"),
              "created outside the browser\n",
              "utf8",
            ),
          isProcessRunning: (pid) => {
            try {
              process.kill(pid, 0);
              return true;
            } catch (cause) {
              if ((cause as NodeJS.ErrnoException).code === "ESRCH") return false;
              throw cause;
            }
          },
          readFixtureFile: () => readFile(join(projectRoot, "notes.md"), "utf8"),
          readSecondProjectFile: () => readFile(join(secondProjectRoot, "second.md"), "utf8"),
          readFixtureDocs: () => readdir(join(projectRoot, "docs")),
          readFixtureScreenshots: () => readdir(join(projectRoot, "docs", "screenshots")),
          readDiagnostics: () => readTreeText(join(hostStateRoot, "diagnostics")),
          readPersistedState: () => readTreeText(stateRoot),
        });
      } finally {
        try {
          const finalReadiness = currentReadiness();
          if (child && finalReadiness) {
            const cleanupPage = await browser.newPage();
            try {
              await disposeServedTerminals(cleanupPage, finalReadiness.url, finalReadiness.secret);
            } finally {
              await cleanupPage.close();
            }
          }
          if (child) await stopHost(child);
        } finally {
          await rm(fixtureRoot, { recursive: true, force: true });
          await rm(stateRoot, { recursive: true, force: true });
        }
      }
    },
    { scope: "worker" },
  ],
});

export { expect };
