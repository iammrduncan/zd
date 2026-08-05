import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * The workflow that runs the guards — audit finding M5.
 *
 * "`npm run check`, the Playwright suite, `cargo test`, and `cargo clippy` all
 * exist and all pass — and nothing runs them on push. The session workflow runs
 * them locally, but the repo's own way-of-working leans hard on guards, and a
 * guard that only runs when someone remembers is the drift F16 describes."
 *
 * **This file cannot prove the workflow passes.** Nothing in this repo can: that
 * takes a GitHub runner, and the honest verification is a green run on the first
 * push. What it can prove is the half that rots silently — that the workflow
 * invokes commands this repo actually has. A workflow calling `npm run lint:all`
 * fails on the runner, days later, with a message about a missing script, and by
 * then nobody connects it to the rename that caused it.
 *
 * Read as text rather than parsed as YAML on purpose. A YAML parser is a
 * dependency this repo does not have, and every claim here is about which
 * commands appear — which is a question about the text.
 */

const ROOT = resolve(process.cwd());
const WORKFLOW = resolve(ROOT, ".github/workflows/check.yml");

const workflow = (): string => readFileSync(WORKFLOW, "utf8");

/** Script names `package.json` actually defines. */
function scripts(): string[] {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  return Object.keys(manifest.scripts);
}

/*
 * CI is deliberately disabled while the prototype is not ready to trust a red
 * run. Keep these contract tests dormant with it; the moment the workflow is
 * restored, the same checks become active again without another test change.
 */
describe.skipIf(!existsSync(WORKFLOW))("the CI workflow", () => {
  it("only runs npm scripts that this repo defines", () => {
    /*
     * The claim that rots. Every `npm run X` in the workflow has to be a script
     * `package.json` has — the file is the one place in the repo that names them
     * from outside, so a rename here is invisible until a runner says so.
     */
    const invoked = [...workflow().matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]!);
    const defined = scripts();

    expect(invoked.length, "the workflow runs no npm scripts at all").toBeGreaterThan(0);
    expect(invoked.filter((name) => !defined.includes(name))).toEqual([]);
  });

  it("runs every guard the audit named", () => {
    /*
     * Named individually rather than as a count, because the failure this guards
     * against is a step being dropped — and a count would be satisfied by any four
     * steps at all. `npm run check` is typecheck, lint, and the unit suite.
     */
    const text = workflow();

    expect(text, "the typecheck, lint and unit suite are not run").toContain("npm run check");
    expect(text, "the end-to-end suite is not run").toContain("npm run test:e2e");
    expect(text, "the Rust tests are not run").toContain("cargo test");
    expect(text, "clippy is not run").toContain("cargo clippy");
  });

  it("makes clippy able to fail", () => {
    /*
     * `cargo clippy` alone exits zero on a lint it reports, so a workflow that runs
     * it without denying warnings has a step that can never go red — which is worse
     * than not running it, because it reads as covered. Verified locally before this
     * was written: `cargo clippy --all-targets -- -D warnings` is clean today.
     */
    expect(workflow()).toMatch(/cargo clippy[^\n]*-D warnings/);
  });

  it("installs dependencies from the lockfile rather than resolving them again", () => {
    // Audit L4 and AGENTS.md both: "Pin versions". `npm install` on a runner is
    // free to pick up a newer transitive dependency, which makes a red run a
    // question about the world rather than about the commit.
    expect(workflow()).toContain("npm ci");
  });

  it("does not retry a failing test", () => {
    /*
     * playwright.config.ts sets `retries: 0` and that is deliberate. There is one
     * known intermittent spec — `focus-keyboard.spec.ts`, about one full run in four
     * — tracked in docs/_objectives/todo.txt with a note to promote it "when it costs a
     * diagnosis rather than a re-run". Retries in CI would take that measurement
     * away and leave the flake permanently invisible.
     *
     * So this asserts the workflow does not quietly add them back. It also means CI
     * will occasionally be red for that spec, which is the intended trade.
     */
    expect(workflow()).not.toMatch(/--retries|PWTEST_RETRIES/);
  });
});
