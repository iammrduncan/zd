import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it("keeps the ADR revision helper covered by its shell contract", () => {
    const result = spawnSync("sh", [resolve(ROOT, "docs/adr/tag-hash.test.sh")], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS: tag-hash.sh");
  });

  it("routes broad contributions through ZSIPs and accepted architecture through ADRs", () => {
    const contributing = page("CONTRIBUTING.md");

    expect(contributing).toContain("docs/zsip/README.md");
    expect(contributing).toContain("docs/adr/README.md");
    expect(contributing).toContain("docs/user-facing-docs/AGENTS.md");
  });
});
