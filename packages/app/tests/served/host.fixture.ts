import { expect, test as base } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const STARTUP_TIMEOUT_MS = 15_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const FIXTURE_TEXT = "# Remote fixture\n\nOpened through the real Rust host.\n";

interface ServedHostFixture {
  readonly url: string;
  readonly secret: string;
  readonly fileText: string;
  restart(): Promise<Readiness>;
  readFixtureFile(): Promise<string>;
  readFixtureDocs(): Promise<readonly string[]>;
  readPersistedState(): Promise<string>;
}

interface Readiness {
  readonly url: string;
  readonly secret: string;
}

function repositoryRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function serverExecutable(root: string): string {
  const extension = process.platform === "win32" ? ".exe" : "";
  return join(root, "target", "debug", `zd-server${extension}`);
}

function validateReadiness(urlValue: string, secret: string): Readiness | null {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
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

function waitForReadiness(child: ReturnType<typeof spawn>): Promise<Readiness> {
  return new Promise((resolveReady, rejectReady) => {
    if (!child.stdout) {
      rejectReady(new Error("the served-host stdout pipe is unavailable"));
      return;
    }
    let buffered = "";
    let url = "";
    let secret = "";
    const finish = () => {
      const readiness = validateReadiness(url, secret);
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

function freeLoopbackPort(excluding: number): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((problem) => {
        if (problem) rejectPort(problem);
        else if (port === 0 || port === excluding)
          void freeLoopbackPort(excluding).then(resolvePort, rejectPort);
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

export const test = base.extend<object, { servedHost: ServedHostFixture }>({
  servedHost: [
    async ({ browserName }, use) => {
      if (browserName !== "chromium") {
        throw new Error("the served-host evidence target requires Chromium");
      }
      const root = repositoryRoot();
      const projectRoot = await mkdtemp(join(tmpdir(), "zd-served-e2e-"));
      const stateRoot = await mkdtemp(join(tmpdir(), "zd-served-state-e2e-"));
      const expectedPrefix = `${resolve(tmpdir())}${sep}zd-served-e2e-`;
      const expectedStatePrefix = `${resolve(tmpdir())}${sep}zd-served-state-e2e-`;
      if (!resolve(projectRoot).startsWith(expectedPrefix)) {
        throw new Error("the served-host fixture root escaped the temporary directory");
      }
      if (!resolve(stateRoot).startsWith(expectedStatePrefix)) {
        throw new Error("the served-host state root escaped the temporary directory");
      }
      let child: ReturnType<typeof spawn> | null = null;
      let readiness: Readiness | null = null;

      const startHost = async (port: number): Promise<Readiness> => {
        const launched = spawn(
          serverExecutable(root),
          [projectRoot, "--state-dir", stateRoot, "--port", String(port)],
          {
            cwd: root,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        launched.stderr?.resume();
        try {
          const ready = await waitForReadiness(launched);
          child = launched;
          readiness = ready;
          return ready;
        } catch (cause) {
          await stopHost(launched);
          throw cause;
        }
      };

      try {
        await mkdir(join(projectRoot, "docs"));
        await writeFile(join(projectRoot, "notes.md"), FIXTURE_TEXT, "utf8");
        await writeFile(join(projectRoot, "docs", "inside.md"), "inside\n", "utf8");
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
          fileText: FIXTURE_TEXT,
          restart: async () => {
            if (!child || !readiness) throw new Error("the served host is not running");
            const oldPort = new URL(readiness.url).port;
            await stopHost(child);
            child = null;
            readiness = null;
            const port = await freeLoopbackPort(Number(oldPort));
            const restarted = await startHost(port);
            if (new URL(restarted.url).port === oldPort) {
              throw new Error("the served host restart reused its previous port");
            }
            return restarted;
          },
          readFixtureFile: () => readFile(join(projectRoot, "notes.md"), "utf8"),
          readFixtureDocs: () => readdir(join(projectRoot, "docs")),
          readPersistedState: () => readTreeText(stateRoot),
        });
      } finally {
        try {
          if (child) await stopHost(child);
        } finally {
          await rm(projectRoot, { recursive: true, force: true });
          await rm(stateRoot, { recursive: true, force: true });
        }
      }
    },
    { scope: "worker" },
  ],
});

export { expect };
