import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SYNCHRONIZER = resolve(ROOT, "packages/scripts/release/sync-version.mjs");
const fixtures: string[] = [];

function makeFixture(version = "1.2.3"): string {
  const root = mkdtempSync(join(tmpdir(), "zd-release-version-"));
  fixtures.push(root);
  mkdirSync(join(root, "packages/tauri"), { recursive: true });
  mkdirSync(join(root, "packages/website"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "zd", version, workspaces: ["packages/website"] })}\n`,
  );
  writeFileSync(
    join(root, "packages/website/package.json"),
    '{"name":"@zd/website","version":"0.9.0"}\n',
  );
  writeFileSync(
    join(root, "package-lock.json"),
    '{"name":"zd","version":"0.9.0","packages":{"":{"name":"zd","version":"0.9.0"},"packages/website":{"name":"@zd/website","version":"0.9.0"}}}\n',
  );
  writeFileSync(
    join(root, "packages/tauri/Cargo.toml"),
    '[package]\nname = "zd"\nversion = "0.9.0"\nedition = "2021"\n',
  );
  writeFileSync(
    join(root, "packages/tauri/Cargo.lock"),
    '[[package]]\nname = "zd"\nversion = "0.9.0"\ndependencies = []\n',
  );
  writeFileSync(
    join(root, "packages/tauri/tauri.conf.json"),
    '{"productName":"zd","version":"0.9.0"}\n',
  );
  return root;
}

function run(root: string, ...arguments_: string[]) {
  return spawnSync(process.execPath, [SYNCHRONIZER, ...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
}

function cargoVersion(path: string): string | undefined {
  return readFileSync(path, "utf8").match(/^version = "([^"]+)"$/m)?.[1];
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("the release version synchronizer", () => {
  it("passes the repository lint rules as a Node script", () => {
    const eslint = resolve(ROOT, "node_modules/eslint/bin/eslint.js");

    const result = spawnSync(process.execPath, [eslint, SYNCHRONIZER], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it("copies the package version into workspace, lockfile, and native metadata", () => {
    const root = makeFixture();

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    const packageLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
      version: string;
      packages: Record<string, { version: string }>;
    };
    const tauri = JSON.parse(
      readFileSync(join(root, "packages/tauri/tauri.conf.json"), "utf8"),
    ) as { version: string };
    expect(packageLock.version).toBe("1.2.3");
    expect(packageLock.packages[""]?.version).toBe("1.2.3");
    expect(packageLock.packages["packages/website"]?.version).toBe("1.2.3");
    expect(
      JSON.parse(readFileSync(join(root, "packages/website/package.json"), "utf8")),
    ).toHaveProperty("version", "1.2.3");
    expect(cargoVersion(join(root, "packages/tauri/Cargo.toml"))).toBe("1.2.3");
    expect(cargoVersion(join(root, "packages/tauri/Cargo.lock"))).toBe("1.2.3");
    expect(tauri.version).toBe("../../package.json");
  });

  it("reports drift without rewriting files in check mode", () => {
    const root = makeFixture();
    const before = readFileSync(join(root, "packages/tauri/Cargo.toml"), "utf8");

    const result = run(root, "--check");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release version metadata is out of sync");
    expect(readFileSync(join(root, "packages/tauri/Cargo.toml"), "utf8")).toBe(before);
  });

  it("does not mistake unrelated Tauri metadata formatting for version drift", () => {
    const root = makeFixture();
    expect(run(root).status).toBe(0);
    const tauriPath = join(root, "packages/tauri/tauri.conf.json");
    const tauri = JSON.parse(readFileSync(tauriPath, "utf8")) as Record<string, unknown>;
    tauri.bundle = { fileAssociations: [{ ext: ["md", "markdown"] }] };
    const customized = `${JSON.stringify(tauri)}\n`;
    writeFileSync(tauriPath, customized);

    const result = run(root, "--check");

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(tauriPath, "utf8")).toBe(customized);
  });

  it("rejects an invalid source version before rewriting metadata", () => {
    const root = makeFixture("next");
    const before = readFileSync(join(root, "package-lock.json"), "utf8");

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("package.json must contain a valid semantic version");
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toBe(before);
  });
});

describe("the 0.2.0 release", () => {
  it("uses package.json as the version source everywhere", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      version: string;
      scripts: Record<string, string>;
      engines: Record<string, string>;
    };

    expect(manifest.version).toBe("0.2.0");
    expect(manifest.scripts.version).toBe("node packages/scripts/release/sync-version.mjs");
    expect(manifest.scripts["version:bump"]).toBe("npm version --no-git-tag-version");
    expect(manifest.scripts["version:check"]).toBe(
      "node packages/scripts/release/sync-version.mjs --check",
    );
    expect(manifest.engines.node).toBe("^22.22.2 || ^24.15.0 || >=26.0.0");
    expect(readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8")).toContain(
      "## [0.2.0] - 2026-08-24",
    );
  });
});
