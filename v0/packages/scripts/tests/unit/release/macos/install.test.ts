import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const INSTALLER = resolve(ROOT, "packaging/macos/install.sh");
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "zd-install-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fakeApplication(root: string) {
  const app = resolve(root, "source", "zd.app");
  const desktop = join(app, "Contents", "MacOS", "zd-desktop");
  const console = join(app, "Contents", "Resources", "bin", "zd");
  mkdirSync(dirname(desktop), { recursive: true });
  mkdirSync(dirname(console), { recursive: true });
  writeFileSync(desktop, "#!/bin/sh\nexit 0\n");
  writeFileSync(console, '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n');
  chmodSync(desktop, 0o755);
  chmodSync(console, 0o755);
  return resolve(root, "source", "zd.app");
}

function fakeSystemCommands(root: string, failLinkMove = false) {
  const commands = resolve(root, "commands");
  const ditto = resolve(commands, "ditto");
  mkdirSync(commands, { recursive: true });
  writeFileSync(ditto, '#!/bin/sh\nset -eu\ncp -R "$1" "$2"\n');
  chmodSync(ditto, 0o755);
  if (failLinkMove) {
    const move = resolve(commands, "mv");
    writeFileSync(
      move,
      [
        "#!/bin/sh",
        "set -eu",
        'if [ "${1:-}" = "-f" ] && [ "${3:-}" = "$ZD_TEST_COMMAND_PATH" ]; then',
        "  exit 1",
        "fi",
        'exec /bin/mv "$@"',
        "",
      ].join("\n"),
    );
    chmodSync(move, 0o755);
  }
  return commands;
}

function install(root: string, source: string, failLinkMove = false) {
  const applications = resolve(root, "Applications");
  const bin = resolve(root, "bin");
  const commands = fakeSystemCommands(root, failLinkMove);
  const result = spawnSync("bash", [INSTALLER], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ZD_APP_SOURCE: source,
      ZD_APPLICATIONS_DIR: applications,
      ZD_BIN_DIR: bin,
      ZD_TEST_COMMAND_PATH: resolve(bin, "zd"),
      PATH: `${commands}:${process.env.PATH ?? ""}`,
    },
  });
  return { applications, bin, result };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("the macOS command installer", () => {
  it("has one package command for installing the built application", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts["install:macos"]).toBe("bash packaging/macos/install.sh");
  });

  it("copies the app and puts its executable on PATH through one stable link", () => {
    const root = temporaryDirectory();
    const source = fakeApplication(root);
    const { applications, bin, result } = install(root, source);
    const installedApp = resolve(applications, "zd.app");
    const command = resolve(bin, "zd");

    expect(result.status, result.stderr).toBe(0);
    expect(lstatSync(command).isSymbolicLink()).toBe(true);
    expect(readlinkSync(command)).toBe(resolve(installedApp, "Contents", "Resources", "bin", "zd"));

    const workspace = resolve(root, "notes");
    mkdirSync(workspace);
    const canonicalWorkspace = realpathSync(workspace);
    const launchForms = [[], ["."], ["plan.md"]];

    expect(
      launchForms.map((args) => {
        const launch = spawnSync(command, args, { cwd: workspace, encoding: "utf8" });
        expect(launch.status, launch.stderr).toBe(0);
        return launch.stdout.trim().split("\n");
      }),
    ).toEqual([[canonicalWorkspace], [canonicalWorkspace, "."], [canonicalWorkspace, "plan.md"]]);
  });

  it("replaces the old app instead of merging stale bundle contents", () => {
    const root = temporaryDirectory();
    const source = fakeApplication(root);
    const stale = resolve(root, "Applications", "zd.app", "Contents", "stale.txt");
    mkdirSync(dirname(stale), { recursive: true });
    writeFileSync(stale, "old release");

    const { result } = install(root, source);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(stale)).toBe(false);
  });

  it("restores the previous app when the command-link replacement fails", () => {
    const root = temporaryDirectory();
    const source = fakeApplication(root);
    const first = install(root, source);
    expect(first.result.status, first.result.stderr).toBe(0);
    const preserved = resolve(first.applications, "zd.app", "Contents", "preserved.txt");
    writeFileSync(preserved, "previous release");

    const failed = install(root, source, true);

    expect(failed.result.status).toBe(1);
    expect(readFileSync(preserved, "utf8")).toBe("previous release");
    expect(readlinkSync(resolve(failed.bin, "zd"))).toBe(
      resolve(failed.applications, "zd.app", "Contents", "Resources", "bin", "zd"),
    );
  });

  it("refuses a source without both executable roles", () => {
    const root = temporaryDirectory();
    const missing = resolve(root, "missing.app");
    const { result } = install(root, missing);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not contain the installed zd executable roles");
  });

  it("does not overwrite an unrelated command", () => {
    const root = temporaryDirectory();
    const source = fakeApplication(root);
    const command = resolve(root, "bin", "zd");
    mkdirSync(dirname(command), { recursive: true });
    writeFileSync(command, "leave me alone");

    const { result } = install(root, source);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing to replace unrelated command");
    expect(readFileSync(command, "utf8")).toBe("leave me alone");
  });

  it("refuses and preserves a staging directory outside the requested install roots", () => {
    const root = temporaryDirectory();
    const source = fakeApplication(root);
    const applications = resolve(root, "Applications");
    const bin = resolve(root, "bin");
    const commands = fakeSystemCommands(root);
    const unsafeStaging = resolve(root, "unrelated");
    const sentinel = resolve(unsafeStaging, "keep.txt");
    const mktemp = resolve(commands, "mktemp");
    mkdirSync(unsafeStaging);
    writeFileSync(sentinel, "keep me");
    writeFileSync(mktemp, '#!/bin/sh\nprintf "%s\\n" "$ZD_TEST_UNSAFE_STAGING"\n');
    chmodSync(mktemp, 0o755);

    const result = spawnSync("bash", [INSTALLER], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ZD_APP_SOURCE: source,
        ZD_APPLICATIONS_DIR: applications,
        ZD_BIN_DIR: bin,
        ZD_TEST_UNSAFE_STAGING: unsafeStaging,
        PATH: `${commands}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing unexpected installer staging path");
    expect(readFileSync(sentinel, "utf8")).toBe("keep me");
  });

  it("removes the first staging directory when the second allocation fails", () => {
    const root = temporaryDirectory();
    const source = fakeApplication(root);
    const applications = resolve(root, "Applications");
    const bin = resolve(root, "bin");
    const commands = fakeSystemCommands(root);
    const allocationState = resolve(root, "mktemp-called");
    const mktemp = resolve(commands, "mktemp");
    writeFileSync(
      mktemp,
      [
        "#!/bin/sh",
        "set -eu",
        'if [ ! -e "$ZD_TEST_MKTEMP_STATE" ]; then',
        '  touch "$ZD_TEST_MKTEMP_STATE"',
        '  candidate="${2%XXXXXX}first"',
        '  mkdir "$candidate"',
        '  printf "%s\\n" "$candidate"',
        "  exit 0",
        "fi",
        "exit 1",
        "",
      ].join("\n"),
    );
    chmodSync(mktemp, 0o755);

    const result = spawnSync("bash", [INSTALLER], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ZD_APP_SOURCE: source,
        ZD_APPLICATIONS_DIR: applications,
        ZD_BIN_DIR: bin,
        ZD_TEST_MKTEMP_STATE: allocationState,
        PATH: `${commands}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(1);
    expect(existsSync(allocationState)).toBe(true);
    expect(existsSync(resolve(applications, ".zd-install.first"))).toBe(false);
  });
});
