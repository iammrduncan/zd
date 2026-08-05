import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const WORKFLOW = resolve(ROOT, ".github/workflows/release.yml");
const RELEASE_GUIDE = resolve(ROOT, "docs/_internal/releasing.md");
const workflow = () => readFileSync(WORKFLOW, "utf8");

describe("the tagged release workflow", () => {
  it("runs only for version tags and validates the package version", () => {
    const source = workflow();

    expect(source).toContain('tags: ["v*.*.*"]');
    expect(source).not.toMatch(/^\s+branches:/m);
    expect(source).toContain('npm run release:check -- "$GITHUB_REF_NAME"');
  });

  it("verifies the release before packaging it", () => {
    const source = workflow();

    expect(source).toContain("npm ci");
    expect(source).toContain("npm run check");
    expect(source).toContain("npm run test:e2e");
    expect(source).toContain("cargo test");
    expect(source).toMatch(/cargo clippy[^\n]*-D warnings/);
    expect(source).not.toMatch(/--retries|PWTEST_RETRIES/);
  });

  it("builds checksum-verified Apple Silicon and Intel downloads", () => {
    const source = workflow();

    expect(source).toContain("runner: macos-15");
    expect(source).toContain("runner: macos-15-intel");
    expect(source).toContain("npm run package:macos");
    expect(source).toContain("hdiutil verify");
    expect(source).toContain("shasum -a 256");
    expect(source).toContain("if-no-files-found: error");
  });

  it("publishes existing-tag assets with the narrow write permission", () => {
    const source = workflow();

    expect(source).toContain("contents: read");
    expect(source).toMatch(/publish:[\s\S]*?permissions:\n\s+contents: write/);
    expect(source).toContain('gh release create "$GITHUB_REF_NAME"');
    expect(source).toContain("--verify-tag");
    expect(source).toContain("--generate-notes");
    expect(source).toContain("GH_TOKEN: ${{ github.token }}");
  });

  it("pins every action and uses only GitHub-maintained actions", () => {
    const actions = [...workflow().matchAll(/uses:\s+([^\s#]+)/g)].map((match) => match[1]!);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => /^actions\/[\w-]+@[0-9a-f]{40}$/.test(action))).toBe(true);
  });

  it("documents the tag-to-download release path", () => {
    const guide = readFileSync(RELEASE_GUIDE, "utf8");

    expect(guide).toContain("npm run release:check -- v<version>");
    expect(guide).toContain("git tag -a v<version>");
    expect(guide).toContain("git push origin v<version>");
    expect(guide).toMatch(/Apple Silicon and\s+Intel DMGs/);
    expect(guide).toContain("SHA-256 checksum");
  });
});
