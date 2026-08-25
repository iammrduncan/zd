#!/usr/bin/env node
/**
 * prose_lint.mjs — find assertions a document cannot support.
 *
 *     node prose_lint.mjs README.md docs/*.md
 *     node prose_lint.mjs --json --fail-on warning -
 *
 * Four rules and an editable pattern list, no configuration:
 *
 *   no-unsupported-claim  a quality asserted of an artifact, with no
 *                      number, link, path, decision id, or measurement anywhere
 *                      in the sentence.
 *   no-time-estimate     a duration offered as a prediction.
 *   no-empty-metaphor    a metaphor standing in for a mechanism
 *   no-ai-tell           a structural tic that carries no information
 *
 * The last two are driven entirely by the `patterns` array in prose-lint.json.
 * Adding a word needs no code change — see reference/adding-rules.md.
 *
 * This is not an AI detector, and it makes no claim about who wrote the text.
 * It checks one property: whether an assertion carries something a reader could
 * go and verify. Vocabulary alone is not evidence of anything — see the
 * provenance note in prose-lint.json.
 *
 * Node standard library only. No install step. The word data sits next to this
 * file and is found automatically.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "1.0.0";
export const SEVERITIES = ["error", "warning", "info"];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_CANDIDATES = [path.join(HERE, "prose-lint.json")];

// --- Findings ---------------------------------------------------------------

export class Finding {
  constructor(filePath, line, column, severity, rule, message, text = "") {
    this.path = filePath;
    this.line = line;
    this.column = column;
    this.severity = severity;
    this.rule = rule;
    this.message = message;
    this.text = text;
  }

  format() {
    return `${this.path}:${this.line}:${this.column}: ${this.severity} [${this.rule}] ${this.message}`;
  }

  asObject() {
    return { path: this.path, line: this.line, column: this.column, severity: this.severity, rule: this.rule, message: this.message, text: this.text };
  }
}

// --- Word data --------------------------------------------------------------

export class Vocabulary {
  constructor(data) {
    this.data = data;
    this.byId = new Map(data.rules.map((r) => [r.id, r]));
    const w = data.words;
    this.quality = alternation(w.qualityAttributes);
    this.assert = alternation(w.assertionVerbs);
    this.subject = new RegExp(`\\b(?:${w.artifactSubjects.join("|")})\\b`, "i");
    this.evidence = new RegExp(`\\b(?:${w.evidenceTokens.join("|")})\\b`, "i");
    this.exclude = new RegExp(`^\\s*(?:${w.nonAssertiveOpeners.join("|")})\\b`, "i");
    this.denial = new RegExp(`\\b(?:${w.claimDenials.join("|")})\\b`, "i");
    this.duration = new RegExp(w.durationPattern, "i");
    this.estimateCue = new RegExp(`\\b(?:${w.estimateCues.join("|")})\\b`, "i");
    this.patterns = (data.patterns ?? []).map(compilePattern);
  }

  /** @param {string | null} [dataPath] */
  static load(dataPath = null) {
    const candidates = dataPath ? [dataPath] : DATA_CANDIDATES;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return new Vocabulary(JSON.parse(fs.readFileSync(candidate, "utf-8")));
    }
    throw new Error(`word data not found (looked in: ${candidates.join(", ")})`);
  }

  rule(id) {
    const found = this.byId.get(id);
    if (!found) throw new Error(`unknown rule: ${id}`);
    return found;
  }

  message(id, detail) {
    const rule = this.rule(id);
    const parts = [detail || rule.message];
    if (rule.next) parts.push(`Do: ${rule.next}`);
    if (rule.never) parts.push(`Never: ${rule.never}`);
    return parts.join(" ");
  }
}

const alternation = (words) => new RegExp(`\\b(?:${words.join("|")})\\b`, "i");

/**
 * Prepare one entry from the `patterns` array.
 *
 * `match` may be a plain phrase or a regular expression; either way it is given
 * word boundaries, so `seams?` matches "seam" and "seams" but not "seamless".
 * That default is what makes the list safe to edit by hand — the alternative
 * silently turns every entry into a substring search. Set `"boundaries": false`
 * for a pattern that must end on punctuation.
 */
export function compilePattern(pattern) {
  if (!pattern.id) throw new Error("a pattern has no id");
  if (!pattern.match) throw new Error(`pattern ${pattern.id} has no match`);
  if (!Array.isArray(pattern.fires) || pattern.fires.length === 0) {
    throw new Error(`pattern ${pattern.id} ships no "fires" example, so nothing proves it works`);
  }
  const body = pattern.boundaries === false ? pattern.match : `\\b(?:${pattern.match})\\b`;
  return {
    ...pattern,
    rule: pattern.rule ?? "no-empty-metaphor",
    regex: new RegExp(body, "i"),
    guard: (pattern.unless ?? []).map((word) => new RegExp(`\\b${word}\\b`, "i")),
  };
}

// --- Text preparation -------------------------------------------------------

/**
 * Blank out anything that is not prose, preserving line and column positions so
 * a finding still points at the right place. Fenced code, inline code, link
 * targets, and HTML comments all go.
 */
export function stripNonProse(text) {
  const lines = text.split("\n");
  const out = [];
  let inFence = false;
  let fenceMark = "";
  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMark = fence[1][0];
        out.push("");
        continue;
      }
      if (fence[1][0] === fenceMark) {
        inFence = false;
        out.push("");
        continue;
      }
    }
    if (inFence) {
      out.push("");
      continue;
    }
    // Keep the visible text of a link, drop the target; blank inline code.
    out.push(
      line
        .replace(/`[^`]*`/g, (m) => " ".repeat(m.length))
        .replace(/\]\([^)]*\)/g, (m) => "]" + " ".repeat(m.length - 1))
        .replace(/<!--.*?-->/g, (m) => " ".repeat(m.length))
        .replace(/^\s{0,3}\|.*$/, (m) => " ".repeat(m.length)),
    );
  }
  return out.join("\n");
}

/**
 * Sentences with their 1-based line and column.
 *
 * Blocks of consecutive lines are joined before splitting, because prose is
 * hard-wrapped and a sentence — or a quotation inside one — routinely crosses a
 * line break. Splitting per line would cut those in half and read the fragments
 * as separate statements.
 */
export function splitSentences(text) {
  const sentences = [];
  const lines = text.split("\n");
  let block = [];

  const flush = () => {
    if (block.length === 0) return;
    let joined = "";
    const starts = [];
    for (const entry of block) {
      starts.push({ offset: joined.length, line: entry.line, indent: entry.indent });
      joined += `${entry.text} `;
    }
    // Map an offset in the joined block back to the line it came from.
    const locate = (offset) => {
      let hit = starts[0];
      for (const start of starts) {
        if (start.offset > offset) break;
        hit = start;
      }
      return { line: hit.line, column: offset - hit.offset + hit.indent + 1 };
    };

    const re = /[^.!?]+[.!?]*/g;
    let match;
    while ((match = re.exec(joined)) !== null) {
      const raw = match[0];
      if (raw.trim().length === 0) continue;
      const lead = raw.length - raw.trimStart().length;
      const at = locate(match.index + lead);
      sentences.push({ text: raw.trim(), line: at.line, column: at.column });
    }
    block = [];
  };

  // A heading or a new list marker starts a block; a wrapped continuation joins
  // the one before it.
  const MARKER = /^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/;
  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      flush();
      return;
    }
    const marker = MARKER.exec(line);
    if (marker) flush();
    const body = marker ? line.slice(marker[0].length) : line;
    const indent = line.length - body.length;
    block.push({ line: index + 1, text: body.trim(), indent });
  });
  flush();
  return sentences;
}

// --- The checks -------------------------------------------------------------

const REFERENT_RE = /\d|\bADR[- ]?\d+|https?:\/\/|\bRFC\s?\d+/i;

/**
 * Ranges covered by double quotes. A document about writing necessarily quotes
 * the writing it is describing, and a word inside quotation marks is being
 * mentioned rather than asserted. Single quotes are excluded because an
 * apostrophe is not a quotation mark.
 */
export function quotedSpans(sentence) {
  const spans = [];
  const re = /"[^"]*"|“[^”]*”/g;
  let hit;
  while ((hit = re.exec(sentence)) !== null) spans.push([hit.index, hit.index + hit[0].length]);
  return spans;
}

const insideQuotes = (index, spans) => spans.some(([start, end]) => index >= start && index < end);

/**
 * A claim is unsupported when it asserts a quality of an artifact and the
 * sentence holds nothing a reader could check: no number, no link, no
 * identifier, no measurement.
 */
export function checkUnsupportedClaims(sentences, vocab, filePath) {
  const findings = [];
  const rule = vocab.rule("no-unsupported-claim");
  for (const sentence of sentences) {
    const s = sentence.text;
    if (vocab.exclude.test(s)) continue;
    // A sentence that forbids or reports a claim is not making one. A style
    // guide saying "make no claim that it is production-ready" is the opposite
    // of the defect.
    if (vocab.denial.test(s)) continue;
    if (!vocab.quality.test(s)) continue;
    if (!vocab.assert.test(s)) continue;
    if (!vocab.subject.test(s)) continue;
    if (REFERENT_RE.test(s) || vocab.evidence.test(s)) continue;
    const match = vocab.quality.exec(s);
    if (insideQuotes(match.index, quotedSpans(s))) continue;
    const quality = match[0];
    findings.push(
      new Finding(filePath, sentence.line, sentence.column, rule.severity, rule.id,
        vocab.message(rule.id, `"${quality}" is asserted here with nothing a reader could check.`), s),
    );
  }
  return findings;
}

/** A duration offered as a prediction, which the engineering doctrine forbids. */
export function checkTimeEstimates(sentences, vocab, filePath) {
  const findings = [];
  const rule = vocab.rule("no-time-estimate");
  for (const sentence of sentences) {
    const s = sentence.text;
    const hit = vocab.duration.exec(s);
    if (!hit) continue;
    if (!vocab.estimateCue.test(s)) continue;
    if (insideQuotes(hit.index, quotedSpans(s))) continue;
    findings.push(
      new Finding(filePath, sentence.line, sentence.column, rule.severity, rule.id,
        vocab.message(rule.id, `"${hit[0].trim()}" is offered as a prediction.`), s),
    );
  }
  return findings;
}

/**
 * The word and phrase patterns from the data file.
 *
 * A pattern is skipped when its match sits inside quotation marks — a document
 * about writing quotes the writing it describes — or when a word from its
 * `unless` guard appears in the same sentence, which is how a term keeps its
 * legitimate technical use.
 */
export function checkPatterns(sentences, vocab, filePath) {
  const findings = [];
  for (const sentence of sentences) {
    const s = sentence.text;
    const quoted = quotedSpans(s);
    for (const pattern of vocab.patterns) {
      const hit = pattern.regex.exec(s);
      if (!hit) continue;
      if (insideQuotes(hit.index, quoted)) continue;
      if (pattern.guard.some((guard) => guard.test(s))) continue;
      const rule = vocab.rule(pattern.rule);
      const detail = `"${hit[0].trim()}" — ${rule.message.replace(/\.$/, "")}.`;
      const next = pattern.instead ? `Do: ${pattern.instead}.` : `Do: ${rule.next}`;
      findings.push(
        new Finding(filePath, sentence.line, sentence.column, rule.severity, rule.id,
          `${detail} ${next} Never: ${rule.never}`, s),
      );
      break; // one finding per sentence; the first is enough to act on
    }
  }
  return findings;
}

export function checkText(text, filePath, vocab) {
  const sentences = splitSentences(stripNonProse(text));
  return [
    ...checkUnsupportedClaims(sentences, vocab, filePath),
    ...checkTimeEstimates(sentences, vocab, filePath),
    ...checkPatterns(sentences, vocab, filePath),
  ].sort((a, b) => a.line - b.line || a.column - b.column || (a.rule < b.rule ? -1 : 1));
}

/**
 * Run every example in the data file against the checker.
 *
 * This is the loop for adding a pattern: write the entry, run --self-test, see
 * it fire. An entry whose own example does not fire is not a rule, and one that
 * fires on its own counter-example is a false-positive generator.
 */
export function selfTest(vocab) {
  const failures = [];
  const check = (id, sentence, shouldFire, matches) => {
    const fired = checkText(sentence, "<self-test>", vocab).some(matches);
    if (fired !== shouldFire) {
      failures.push(`${id}: expected ${shouldFire ? "a finding" : "no finding"} for ${JSON.stringify(sentence)}`);
    }
  };

  for (const rule of vocab.data.rules) {
    for (const sentence of rule.fixtures?.fires ?? []) check(rule.id, sentence, true, (f) => f.rule === rule.id);
    for (const sentence of rule.fixtures?.passes ?? []) check(rule.id, sentence, false, (f) => f.rule === rule.id);
  }
  for (const pattern of vocab.patterns) {
    const isThis = (f) => f.rule === pattern.rule && f.text !== undefined;
    for (const sentence of pattern.fires) check(pattern.id, sentence, true, isThis);
    for (const sentence of pattern.passes ?? []) check(pattern.id, sentence, false, isThis);
  }
  return failures;
}

// --- Driver -----------------------------------------------------------------

const USAGE = `usage: prose_lint.mjs [-h] [--data DATA] [--json]
                     [--fail-on {error,warning,info,never}] [--version]
                     FILE [FILE ...]

Find assertions a document cannot support.

positional arguments:
  FILE                  file to check, or "-" for stdin

options:
  -h, --help            show this help message and exit
  --data DATA           path to prose-lint.json (default: found next to this file)
  --self-test           run every example in prose-lint.json and report
  --json                write findings as JSON
  --fail-on {error,warning,info,never}
                        lowest severity that makes the exit status 1 (default: error)
  --version             show program's version number and exit`;

export function parseArgs(argv) {
  const args = { paths: [], data: null, json: false, failOn: "error", selfTest: false };
  const failOns = [...SEVERITIES, "never"];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    else if (arg === "--version") return { version: true };
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--data") args.data = argv[++i];
    else if (arg.startsWith("--data=")) args.data = arg.slice(7);
    else if (arg === "--fail-on" || arg.startsWith("--fail-on=")) {
      args.failOn = arg.includes("=") ? arg.slice(10) : argv[++i];
      if (!failOns.includes(args.failOn)) {
        throw new Error(`argument --fail-on: invalid choice: '${args.failOn}' (choose from ${failOns.map((f) => `'${f}'`).join(", ")})`);
      }
    } else if (arg.startsWith("--")) throw new Error(`unrecognized arguments: ${arg}`);
    else args.paths.push(arg);
  }
  if (args.paths.length === 0 && !args.selfTest) throw new Error("the following arguments are required: FILE");
  return args;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (exc) {
    process.stderr.write(`${USAGE}\nprose_lint.mjs: error: ${exc.message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  if (args.version) {
    process.stdout.write(`prose_lint.mjs ${VERSION}\n`);
    return 0;
  }

  let vocab;
  try {
    vocab = Vocabulary.load(args.data);
  } catch (exc) {
    process.stderr.write(`prose_lint.mjs: ${exc.message}\n`);
    return 2;
  }

  if (args.selfTest) {
    const failures = selfTest(vocab);
    for (const failure of failures) process.stdout.write(`FAIL ${failure}\n`);
    const examples = vocab.data.rules.reduce(
      (n, r) => n + (r.fixtures?.fires?.length ?? 0) + (r.fixtures?.passes?.length ?? 0),
      vocab.patterns.reduce((n, p) => n + p.fires.length + (p.passes?.length ?? 0), 0),
    );
    process.stdout.write(
      failures.length === 0
        ? `ok — ${examples} examples across ${vocab.data.rules.length} rules and ${vocab.patterns.length} patterns\n`
        : `${failures.length} of ${examples} examples failed\n`,
    );
    return failures.length === 0 ? 0 : 1;
  }

  const findings = [];
  for (const target of args.paths) {
    let text;
    try {
      text = target === "-" ? fs.readFileSync(0, "utf-8") : fs.readFileSync(target, "utf-8");
    } catch (exc) {
      process.stderr.write(`prose_lint.mjs: ${exc.message}\n`);
      return 2;
    }
    findings.push(...checkText(text, target === "-" ? "<stdin>" : target, vocab));
  }

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  if (args.json) {
    process.stdout.write(JSON.stringify({ version: VERSION, counts, findings: findings.map((f) => f.asObject()) }, null, 1) + "\n");
  } else {
    for (const finding of findings) process.stdout.write(finding.format() + "\n");
    process.stderr.write(`${findings.length} findings (${SEVERITIES.map((s) => `${counts[s]} ${s}`).join(", ")})\n`);
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
