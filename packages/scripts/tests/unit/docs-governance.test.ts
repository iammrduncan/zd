import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const ADRS = [
  "docs/adr/suite/0001-use-tauri-with-portable-web-frontend_H.md",
  "docs/adr/suite/0002-put-native-authority-behind-platform-boundary_H.md",
  "docs/adr/suite/0003-scope-file-access-to-launch-workspace_H.md",
  "docs/adr/suite/0004-dispatch-application-commands-from-suite-registry_H.md",
  "docs/adr/md/0001-use-browser-layout-for-markdown_H.md",
  "docs/adr/md/0002-use-one-always-editable-document-surface_H.md",
  "docs/adr/md/0003-confirm-writes-before-marking-a-document-clean_H.md",
  "docs/adr/md/0004-treat-rendered-markdown-as-untrusted_H.md",
  "docs/adr/repository/0001-use-a-feedback-driven-session-loop_H.md",
  "docs/adr/repository/0002-publish-versioned-macos-releases_H.md",
  "docs/adr/repository/0003-organize-docs-by-authority-and-audience_H.md",
];

const page = (path: string): string => readFileSync(resolve(ROOT, path), "utf8");

describe("the Zen Suite documentation governance system", () => {
  it("records the accepted decisions recovered from audits, feedback, and implementation", () => {
    expect(ADRS.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);

    const index = page("docs/adr/README.md");
    for (const path of ADRS) {
      const link = relative(resolve(ROOT, "docs/adr"), resolve(ROOT, path));
      expect(index, `${path} is not indexed`).toContain(link);
    }
  });

  it("gives every ADR the permanent five-part record shape", () => {
    for (const path of ADRS) {
      const source = page(path);
      expect(source, path).toMatch(/^# \d{4}: .+$/m);
      expect(source, path).toMatch(/^## Status\n\n(?:Accepted|Deprecated|Superseded)/m);
      expect(source, path).toMatch(/^## Context$/m);
      expect(source, path).toMatch(/^## Decision$/m);
      expect(source, path).toMatch(/^## Consequences$/m);
    }
  });

  it("creates numbered ZSIPs only from submitted pull requests", () => {
    const numberedProposals = readdirSync(resolve(ROOT, "docs/zsip")).filter((name) =>
      /^\d{4}-.+\.md$/.test(name),
    );
    const index = page("docs/zsip/README.md");

    expect(numberedProposals).toEqual([]);
    expect(index).toContain("No ZSIPs have been submitted");
    expect(index).toContain("pull request");
  });

  it("applies folder instructions to ADRs and standalone user documentation", () => {
    const required = [
      "docs/adr/AGENTS.md",
      "docs/adr/CLAUDE.md",
      "docs/user-facing-docs/AGENTS.md",
      "docs/user-facing-docs/CLAUDE.md",
      "docs/user-facing-docs/DOCUMENTATION_STANDARDS_A.md",
    ];

    expect(required.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
    expect(page("docs/adr/CLAUDE.md")).toContain("@AGENTS.md");
    expect(page("docs/user-facing-docs/CLAUDE.md")).toContain("@AGENTS.md");
  });

  it("covers the ADR revision helper inside the established unit suite", () => {
    const tagHash = resolve(ROOT, "docs/adr/tag-hash.sh");
    const standaloneTest = resolve(ROOT, "docs/adr/tag-hash.test.sh");

    expect(existsSync(standaloneTest)).toBe(false);

    const usage = spawnSync(tagHash, [], { cwd: ROOT, encoding: "utf8" });
    expect(usage.status).toBe(64);
    expect(usage.stderr).toContain("Usage:");

    const testDirectory = mkdtempSync(resolve(tmpdir(), "zd-tag-hash-"));
    const adr = resolve(testDirectory, "test-adr.md");

    try {
      writeFileSync(adr, "# 9999: Test decision\n");

      const first = spawnSync(tagHash, [adr, "First test note."], {
        cwd: ROOT,
        encoding: "utf8",
      });
      const second = spawnSync(tagHash, [adr], { cwd: ROOT, encoding: "utf8" });
      const source = readFileSync(adr, "utf8");
      const gitHash = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
      }).stdout.trim();

      expect(first.status, first.stderr).toBe(0);
      expect(second.status, second.stderr).toBe(0);
      expect(source.match(/^## Revision history$/gm)).toHaveLength(1);
      expect(source.match(new RegExp(gitHash, "g"))).toHaveLength(2);
      expect(source).toContain("First test note.");
      expect(source).toContain("Prior version before this in-place revision.");
    } finally {
      rmSync(testDirectory, { recursive: true, force: true });
    }
  });

  it("routes broad contributions through ZSIPs and accepted architecture through ADRs", () => {
    const contributing = page("CONTRIBUTING.md");

    expect(contributing).toContain("docs/zsip/README.md");
    expect(contributing).toContain("docs/adr/README.md");
    expect(contributing).toContain("docs/user-facing-docs/AGENTS.md");
  });
});
