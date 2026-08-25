#!/usr/bin/env node
/**
 * structure_lint.mjs — check where files live and whether they are reachable.
 *
 *     node structure_lint.mjs [ROOT]
 *     node structure_lint.mjs --json --fail-on warning .
 *
 * Four checks, no configuration. Every check states the oracle it used:
 *
 *   derived    read from the repository's own configuration. A proof.
 *   heuristic  a threshold over the tree shape. A proxy, and labelled as one.
 *
 * When an oracle cannot be found the check is skipped and reported as not
 * checked. A guess dressed as a finding is worse than no finding.
 *
 * Node standard library only. No install step. The rule data sits next to this
 * file and is found automatically.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const VERSION = "1.0.0";
export const SEVERITIES = ["error", "warning", "info"];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_CANDIDATES = [path.join(HERE, "structure-lint.json")];

// --- Findings ---------------------------------------------------------------

export class Finding {
  constructor(filePath, line, column, severity, rule, message, oracle = "derived") {
    this.path = filePath;
    this.line = line;
    this.column = column;
    this.severity = severity;
    this.rule = rule;
    this.message = message;
    this.oracle = oracle;
  }

  format() {
    const proxy = this.oracle === "heuristic" ? " (proxy)" : "";
    return `${this.path}:${this.line}:${this.column}: ${this.severity} [${this.rule}]${proxy} ${this.message}`;
  }

  asObject() {
    return {
      path: this.path,
      line: this.line,
      column: this.column,
      severity: this.severity,
      rule: this.rule,
      message: this.message,
      oracle: this.oracle,
    };
  }
}

function compareFindings(a, b) {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
}

// --- Rule data --------------------------------------------------------------

export class Rules {
  constructor(data) {
    this.data = data;
    this.byId = new Map(data.rules.map((r) => [r.id, r]));
  }

  /** @param {string | null} [dataPath] */
  static load(dataPath = null) {
    const candidates = dataPath ? [dataPath] : DATA_CANDIDATES;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return new Rules(JSON.parse(fs.readFileSync(candidate, "utf-8")));
      }
    }
    throw new Error(`rule data not found (looked in: ${candidates.join(", ")})`);
  }

  get(id) {
    const rule = this.byId.get(id);
    if (!rule) throw new Error(`unknown rule: ${id}`);
    return rule;
  }

  /**
   * Build the agent-facing message. `next` says what to do; `never` names the
   * cheap wrong fix, because a rule whose violation has a mechanical
   * suppression teaches the suppression.
   */
  message(id, detail) {
    const rule = this.get(id);
    const parts = [detail || rule.message];
    if (rule.next) parts.push(`Do: ${rule.next}`);
    if (rule.never) parts.push(`Never: ${rule.never}`);
    return parts.join(" ");
  }
}

// --- Globs ------------------------------------------------------------------

/** Minimal glob to RegExp. Supports **, *, ?, and {a,b} alternation. */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more directories; a bare `**` matches anything.
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") out += "[^/]";
    else if (c === "{") {
      const close = glob.indexOf("}", i);
      if (close === -1) out += "\\{";
      else {
        const alts = glob.slice(i + 1, close).split(",");
        out += `(?:${alts.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
        i = close;
      }
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

const matchesAny = (candidate, globs) => globs.some((g) => globToRegExp(g).test(candidate));

// --- The file list ----------------------------------------------------------

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", "vendor",
  ".venv", "venv", "__pycache__", ".next", ".turbo", ".cache", "coverage",
]);

/**
 * Tracked files, relative to root and slash-separated. Uses git when the root
 * is a repository, because git already knows what is ignored.
 */
export function listFiles(root) {
  try {
    // --others --exclude-standard includes files that exist but are not yet
    // staged. An agent-facing checker has to see the file the agent just wrote.
    const out = execFileSync(
      "git",
      ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const files = out.split("\n").filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // Not a git repository, or git is absent. Walk the tree instead.
  }
  const files = [];
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) files.push(rel);
    }
  };
  walk(root, "");
  return files.sort();
}

const readIfPresent = (root, rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), "utf-8");
  } catch {
    return null;
  }
};

// --- Oracle: where does this project say its tests live? --------------------

/** Extract a string-array literal for `key` from JS/TS source. Regex, not a parser. */
function arrayLiteral(source, key) {
  const re = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`);
  const hit = re.exec(source);
  if (!hit) return null;
  const items = [...hit[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  return items.length > 0 ? items : null;
}

/**
 * The declared test roots, and where that declaration came from.
 * Returns {globs, source} or {globs: null, reason} when nothing declares them.
 */
export function declaredTestGlobs(root, files) {
  const configs = [
    "vitest.config.ts", "vitest.config.js", "vitest.config.mjs",
    "vite.config.ts", "vite.config.js", "vite.config.mjs",
    "jest.config.ts", "jest.config.js", "jest.config.mjs",
  ].filter((c) => files.includes(c));

  for (const config of configs) {
    const source = readIfPresent(root, config);
    if (!source) continue;
    const globs = arrayLiteral(source, "include") || arrayLiteral(source, "testMatch");
    if (globs) return { globs, source: config };
  }

  // Every package.json in the tree, nearest first, so a monorepo's test package
  // declares its own roots.
  for (const manifest of files.filter((f) => f === "package.json" || f.endsWith("/package.json")).sort()) {
    const raw = readIfPresent(root, manifest);
    if (!raw) continue;
    let pkg;
    try {
      pkg = JSON.parse(raw);
    } catch {
      continue; // A malformed package.json is someone else's finding to report.
    }
    const base = manifest === "package.json" ? "" : `${manifest.slice(0, -"/package.json".length)}/`;

    const fromJest = pkg.jest?.testMatch || pkg.jest?.roots;
    if (Array.isArray(fromJest) && fromJest.length > 0) {
      return { globs: fromJest.map((g) => base + g.replace(/^\.\//, "")), source: `${manifest} (jest)` };
    }

    // A test script names its own files: `tsx --test unit/*.test.ts`. That is a
    // declaration, and deriving it beats asking a human to repeat it.
    const scripts = Object.entries(pkg.scripts || {}).filter(([name]) => /^test/.test(name));
    const globs = [];
    for (const [, command] of scripts) {
      for (const token of command.split(/\s+/)) {
        if (token.startsWith("-") || !/[*?]/.test(token)) continue;
        if (!TEST_NAME_RE.test(token.replace(/\*/g, "x"))) continue;
        globs.push(base + token.replace(/^\.\//, ""));
      }
    }
    if (globs.length > 0) return { globs: [...new Set(globs)], source: `${manifest} (test script)` };
  }

  for (const [file, re] of [
    ["pytest.ini", /testpaths\s*=\s*(.+)/],
    ["setup.cfg", /testpaths\s*=\s*(.+)/],
    ["tox.ini", /testpaths\s*=\s*(.+)/],
    ["pyproject.toml", /testpaths\s*=\s*\[([^\]]*)\]/],
  ]) {
    const source = readIfPresent(root, file);
    if (!source) continue;
    const hit = re.exec(source);
    if (!hit) continue;
    const raw = hit[1];
    const items = raw.includes('"') || raw.includes("'")
      ? [...raw.matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
      : raw.trim().split(/\s+/).filter(Boolean);
    if (items.length > 0) return { globs: items.map((i) => `${i.replace(/\/$/, "")}/**`), source: file };
  }

  return { globs: null, reason: "no test runner configuration declares where tests live" };
}

const TEST_NAME_RE = /(^|\/)(test_[^/]+\.py|[^/]+_test\.(py|go|ts|js)|[^/]+\.(test|spec)\.[cm]?[jt]sx?)$/;

/**
 * Fixture and snapshot trees hold files that are deliberately shaped like code
 * without being code. A test fixture that looks like a test is data, and
 * flagging it is a false positive rather than a finding.
 */
const FIXTURE_RE = /(^|\/)(fixtures?|__fixtures__|testdata|snapshots|__snapshots__|golden|corpus)\//;

/**
 * Vendored code is somebody else's, and their layout is not ours to judge. It
 * also ships its own tests, which our runner is not meant to collect.
 */
const VENDOR_RE = /(^|\/)(vendor|vendored|third[_-]party|extern)\//;

// --- Check 1: a test the runner will not collect ----------------------------

export function checkTestPlacement(root, files, rules) {
  const findings = [];
  const declared = declaredTestGlobs(root, files);
  if (!declared.globs) return { findings, skipped: rules.get("no-uncollected-test").id, reason: declared.reason };

  // Normalise the runner's globs: a leading ./ or **/ is noise for our purposes.
  const globs = declared.globs.map((g) => g.replace(/^\.\//, ""));

  for (const file of files) {
    if (!TEST_NAME_RE.test(file)) continue;
    if (FIXTURE_RE.test(file) || VENDOR_RE.test(file)) continue;
    if (matchesAny(file, globs)) continue;
    // Go co-locates by language rule; the runner never declares a path for it.
    if (file.endsWith("_test.go")) continue;
    findings.push(
      new Finding(
        file, 1, 1,
        rules.get("no-uncollected-test").severity,
        "no-uncollected-test",
        rules.message(
          "no-uncollected-test",
          `${declared.source} does not collect this file, so its assertions never run.`,
        ),
        "derived",
      ),
    );
  }
  return { findings, skipped: null };
}

// --- Check 2: a script nothing invokes --------------------------------------

const SCRIPT_DIR_RE = /^(scripts|tools|bin)\//;
const SCRIPT_EXT_RE = /\.(sh|bash|zsh|py|rb|pl|mjs|cjs|js|ts)$/;

export function checkOrphanScripts(root, files, rules) {
  const findings = [];
  const scripts = files.filter(
    (f) => SCRIPT_DIR_RE.test(f) && SCRIPT_EXT_RE.test(f) && !FIXTURE_RE.test(f) && !VENDOR_RE.test(f),
  );
  if (scripts.length === 0) return { findings, skipped: null };

  // Everything that could plausibly name a script: config, CI, docs, and source.
  const haystackFiles = files.filter(
    (f) =>
      !scripts.includes(f) &&
      (/(^|\/)(package\.json|Makefile|makefile|justfile|Taskfile\.ya?ml|pyproject\.toml)$/.test(f) ||
        /^\.github\/workflows\//.test(f) ||
        /\.(md|ya?ml|toml|json|sh|bash|mjs|cjs|js|ts|tsx|py)$/.test(f)),
  );
  const haystack = haystackFiles
    .map((f) => readIfPresent(root, f))
    .filter(Boolean)
    .join("\n");

  for (const script of scripts) {
    const base = path.posix.basename(script);
    const stem = base.replace(SCRIPT_EXT_RE, "");
    // A reference is the filename, the path, or the bare stem used as a task name.
    const referenced =
      haystack.includes(base) ||
      haystack.includes(script) ||
      new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
    if (referenced) continue;
    findings.push(
      new Finding(
        script, 1, 1,
        rules.get("no-orphan-script").severity,
        "no-orphan-script",
        rules.message(
          "no-orphan-script",
          "No package script, CI workflow, Makefile, document, or source file names this script.",
        ),
        "derived",
      ),
    );
  }
  return { findings, skipped: null };
}

// --- Check 3 and 4: directory shape -----------------------------------------

const GENERATED_RE = /(^|\/)(\.gen\.|generated\/|__generated__\/|dist\/|build\/)/;

/** Split a basename into lowercase tokens on -, _, ., and camelCase boundaries. */
export function tokenise(basename) {
  const stem = basename.replace(/\.[^.]+$/, "");
  return stem
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_. ]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

export function directoryStats(files) {
  const byDir = new Map();
  const subdirs = new Map();
  for (const file of files) {
    // A fixture tree's shape is dictated by whatever it exercises, not by us.
    if (GENERATED_RE.test(file) || FIXTURE_RE.test(file) || VENDOR_RE.test(file)) continue;
    const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(path.posix.basename(file));
    // Record the parent so we can tell a flat leaf from a directory with children.
    const parent = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : ".";
    if (dir !== ".") subdirs.set(parent, (subdirs.get(parent) || 0) + 1);
  }

  const stats = [];
  for (const [dir, names] of byDir) {
    const unique = new Set(names);
    if (unique.size !== names.length) continue; // defensive; git never lists a dupe
    const firstTokens = names.map((n) => tokenise(n)[0]).filter(Boolean);
    const counts = new Map();
    for (const token of firstTokens) counts.set(token, (counts.get(token) || 0) + 1);
    const clusters = [...counts.entries()].filter(([, n]) => n >= 3);
    const inCluster = clusters.reduce((sum, [, n]) => sum + n, 0);
    const coverage = names.length > 0 ? inCluster / names.length : 0;
    // Shannon entropy over first tokens, reported so a reader can see the shape.
    let entropy = 0;
    for (const [, n] of counts) {
      const p = n / firstTokens.length;
      entropy -= p * Math.log2(p);
    }
    stats.push({
      dir,
      files: names.length,
      clusters: clusters.length,
      clusterNames: clusters.sort((a, b) => b[1] - a[1]).map(([t]) => t),
      coverage,
      entropy,
      subdirs: subdirs.get(dir) || 0,
      digitLed: names.filter((n) => /^\d/.test(n)).length / names.length,
    });
  }
  return stats;
}

/**
 * Does the prefix repeat the directory's own name?
 *
 * `fns/fn-add.ts` does; `rules/no-unknown-returns.mjs` does not — there `no-` is
 * the rule's public identifier, and renaming the file would break the link
 * between it and the id a config enables. Without this the rule fires on every
 * lint plugin ever written, which is how it was found.
 */
export function echoesDirectory(dir, prefix) {
  const name = dir.slice(dir.lastIndexOf("/") + 1).toLowerCase();
  const token = prefix.toLowerCase();
  return name.startsWith(token) || token.startsWith(name) || name.replace(/s$/, "") === token;
}

export function checkDirectoryShape(files, rules) {
  const findings = [];
  const split = rules.get("no-folder-in-filenames");
  const prefix = rules.get("no-redundant-prefix");
  const t = rules.data.thresholds;

  for (const s of directoryStats(files)) {
    // Migrations, ADRs, and dated collections are meant to look like this.
    if (s.digitLed >= t.digitLedExclusion) continue;

    if (s.files >= t.minFiles && s.coverage >= t.splitCoverage && s.clusters >= t.minClusters && s.subdirs <= t.maxSubdirs) {
      findings.push(
        new Finding(
          `${s.dir}/`, 1, 1, split.severity, split.id,
          rules.message(
            split.id,
            `${s.files} files here fall into ${s.clusters} prefix families (${s.clusterNames.slice(0, 4).join(", ")}), covering ${(s.coverage * 100).toFixed(0)}% of the directory.`,
          ),
          "heuristic",
        ),
      );
    } else if (
      s.clusters === 1 &&
      s.coverage >= t.prefixCoverage &&
      s.files >= t.minFiles &&
      echoesDirectory(s.dir, s.clusterNames[0])
    ) {
      findings.push(
        new Finding(
          `${s.dir}/`, 1, 1, prefix.severity, prefix.id,
          rules.message(
            prefix.id,
            `${(s.coverage * 100).toFixed(0)}% of the ${s.files} files here start with "${s.clusterNames[0]}", which the directory name already carries.`,
          ),
          "heuristic",
        ),
      );
    }
  }
  return { findings, skipped: null };
}

// --- Driver -----------------------------------------------------------------

export function checkRepository(root, rules) {
  const files = listFiles(root);
  const results = [
    checkTestPlacement(root, files, rules),
    checkOrphanScripts(root, files, rules),
    checkDirectoryShape(files, rules),
  ];
  const findings = results.flatMap((r) => r.findings).sort(compareFindings);
  const notChecked = results.filter((r) => r.skipped).map((r) => ({ rule: r.skipped, reason: r.reason }));
  return { files, findings, notChecked };
}

const USAGE = `usage: structure_lint.mjs [-h] [--data DATA] [--json]
                         [--fail-on {error,warning,info,never}] [--version]
                         [ROOT]

Check where files live and whether they are reachable.

positional arguments:
  ROOT                  repository root to check (default: the current directory)

options:
  -h, --help            show this help message and exit
  --data DATA           path to structure-lint.json (default: found next to
                        this file)
  --json                write findings as JSON
  --fail-on {error,warning,info,never}
                        lowest severity that makes the exit status 1 (default:
                        error)
  --version             show program's version number and exit`;

export function parseArgs(argv) {
  const args = { root: ".", data: null, json: false, failOn: "error" };
  const failOns = [...SEVERITIES, "never"];
  let sawRoot = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    else if (arg === "--version") return { version: true };
    else if (arg === "--json") args.json = true;
    else if (arg === "--data") args.data = argv[++i];
    else if (arg.startsWith("--data=")) args.data = arg.slice(7);
    else if (arg === "--fail-on" || arg.startsWith("--fail-on=")) {
      args.failOn = arg.includes("=") ? arg.slice(10) : argv[++i];
      if (!failOns.includes(args.failOn)) {
        throw new Error(`argument --fail-on: invalid choice: '${args.failOn}' (choose from ${failOns.map((f) => `'${f}'`).join(", ")})`);
      }
    } else if (arg.startsWith("--")) throw new Error(`unrecognized arguments: ${arg}`);
    else if (sawRoot) throw new Error(`unrecognized arguments: ${arg}`);
    else {
      args.root = arg;
      sawRoot = true;
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (exc) {
    process.stderr.write(`${USAGE}\nstructure_lint.mjs: error: ${exc.message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  if (args.version) {
    process.stdout.write(`structure_lint.mjs ${VERSION}\n`);
    return 0;
  }

  let rules;
  try {
    rules = Rules.load(args.data);
  } catch (exc) {
    process.stderr.write(`structure_lint.mjs: ${exc.message}\n`);
    return 2;
  }
  if (!fs.existsSync(args.root)) {
    process.stderr.write(`structure_lint.mjs: ${args.root} does not exist\n`);
    return 2;
  }

  const { files, findings, notChecked } = checkRepository(args.root, rules);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ version: VERSION, root: args.root, filesScanned: files.length, counts, notChecked, findings: findings.map((f) => f.asObject()) }, null, 1) + "\n",
    );
  } else {
    for (const finding of findings) process.stdout.write(finding.format() + "\n");
    const summary = SEVERITIES.map((s) => `${counts[s]} ${s}`).join(", ");
    process.stderr.write(`${findings.length} findings (${summary}) over ${files.length} files\n`);
    for (const skip of notChecked) process.stderr.write(`not checked [${skip.rule}]: ${skip.reason}\n`);
  }

  if (args.failOn === "never") return 0;
  const threshold = SEVERITIES.indexOf(args.failOn);
  return findings.some((f) => SEVERITIES.indexOf(f.severity) <= threshold) ? 1 : 0;
}

if (
  process.argv[1] &&
  fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])
) {
  process.exitCode = main();
}
