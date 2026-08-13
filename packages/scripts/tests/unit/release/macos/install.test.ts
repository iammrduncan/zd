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
  const executable = join(root, "source", "zd.app", "Contents", "MacOS", "zd");
  mkdirSync(dirname(executable), { recursive: true });
  writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\n');
  chmodSync(executable, 0o755);
  return resolve(root, "source", "zd.app");
}

function install(root: string, source: string) {
  const applications = resolve(root, "Applications");
  const bin = resolve(root, "bin");
  const result = spawnSync("bash", [INSTALLER], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ZD_APP_SOURCE: source,
      ZD_APPLICATIONS_DIR: applications,
      ZD_BIN_DIR: bin,
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
    expect(readlinkSync(command)).toBe(resolve(installedApp, "Contents", "MacOS", "zd"));

    const workspace = resolve(root, "notes");
    mkdirSync(workspace);
    const canonicalWorkspace = realpathSync(workspace);
    const launchForms = [[], ["md", "."], ["md", "plan.md"]];

    expect(
      launchForms.map((args) => {
        const launch = spawnSync(command, args, { cwd: workspace, encoding: "utf8" });
        expect(launch.status, launch.stderr).toBe(0);
        return launch.stdout.trim().split("\n");
      }),
    ).toEqual([
      [canonicalWorkspace],
      [canonicalWorkspace, "md", "."],
      [canonicalWorkspace, "md", "plan.md"],
    ]);
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

  it("refuses a source without the zd executable", () => {
    const root = temporaryDirectory();
    const missing = resolve(root, "missing.app");
    const { result } = install(root, missing);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not contain Contents/MacOS/zd");
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
});
