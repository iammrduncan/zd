#!/usr/bin/env node
/**
 * Check text against the ASD-STE100 Simplified Technical English writing rules.
 *
 * Node standard library only, no installation, no network. Copy this file and
 * ste100-lint.json anywhere and run it.
 *
 *     node ste_lint.mjs manual.txt
 *     node ste_lint.mjs --mode procedural steps.txt
 *     node ste_lint.mjs --json docs/*.md
 *     cat draft.txt | node ste_lint.mjs -
 *
 * Output is one finding per line:
 *
 *     manual.txt:12:5: error [1.1] "ensure" is not approved in STE. Use MAKE SURE (v).
 *
 * Exit status is 0 when nothing at or above --fail-on is found, 1 when something
 * is, and 2 on a usage or data error.
 *
 * What this can and cannot check
 * ------------------------------
 * STE has 53 rules and 8 general recommendations. Most need to know a word's part
 * of speech in context, which needs a parser this deliberately is not. So this
 * tool checks the rules that can be decided from the text and the dictionary
 * alone, and says nothing about the rest. Every finding names the rule it comes
 * from so it can be looked up in reference/ste-guide.md or in the standard.
 *
 * It is deterministic: the same input and the same dictionary always give exactly
 * the same findings, in the same order. There is no model and no randomness.
 *
 * A word that the dictionary does not list at all is not reported. Rules 1.5 and
 * 1.12 let a writer use any technical noun or technical verb from their subject
 * field, and those are by definition absent from the dictionary. Only words the
 * dictionary explicitly lists as not approved are flagged. Use --strict to also
 * list unknown words, as a prompt to confirm each really is a technical term.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "1.0.0";

const SCHEMA_PREFIX = "asd-ste100/1";

// Where to look for the dataset, relative to this file. The first hit wins. The
// shipped layout puts ste100-lint.json next to this script, which is the second
// candidate; the rest let it also run from a checkout or a skill directory.
const DATA_CANDIDATES = [
  "data/ste100-lint.json",
  "ste100-lint.json",
  "data/ste100.json",
  "ste100.json",
  "../data/ste100-lint.json",
  "../data/ste100.json",
];

export const SEVERITIES = ["error", "warning", "info"];

// --- Small helpers ---------------------------------------------------------

/** Python's str.strip(chars): remove any of `chars` from both ends. */
function stripChars(text, chars) {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start += 1;
  while (end > start && chars.includes(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/** Python's str.split() with no argument: split on runs of whitespace, no empties. */
function splitWhitespace(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All matches of a global regex, as objects with index and groups. */
function* finditer(regex, text) {
  const scan = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  let match;
  while ((match = scan.exec(text)) !== null) {
    yield match;
    if (match[0] === "") scan.lastIndex += 1; // never loop on a zero-width match
  }
}

// --- Word counting (rules 8.4 thru 8.7) ------------------------------------

// Rule 8.6 counts "numbers together with units of measurement" as one word.
// Deciding what is a unit needs a list: symbols, and the spelled-out names the
// standard uses in its own examples ("Drain approximately 2 liters of fuel from
// the tank" is 8 words, so "2 liters" is one).
const _UNIT_SYMBOLS = `
    m cm mm km um nm in ft yd mi mil
    g kg mg lb oz t
    s ms us ns min h hr d
    l ml cl dl gal qt pt
    n kn kgf lbf
    pa kpa mpa bar mbar psi psig psia inhg mmhg torr atm
    c f k degc degf
    v mv kv a ma ua w kw mw hp va kva ah mah
    hz khz mhz ghz rpm
    j kj cal kcal btu wh kwh ozin lbin lbft
    deg rad sr
    db dba ppm pph gpm lpm cfm scfm
`;
const _UNIT_NAMES = `
    liter litre meter metre gram tonne
    inch foot feet yard mile pound ounce
    second minute hour day week month year
    degree radian knot volt amp ampere watt joule calorie
    percent revolution cycle turn
`;

function withPlurals(names) {
  const out = new Set();
  for (const name of splitWhitespace(names)) {
    out.add(name);
    out.add(name + "s");
    if (name.endsWith("ch")) out.add(name + "es");
  }
  return out;
}

export const UNITS = new Set([...splitWhitespace(_UNIT_SYMBOLS), ...withPlurals(_UNIT_NAMES)]);

const _NUMBER_RE = /^[+-]?[\d.,]*\d[\d.,]*$/;
// Rule 8.6: alphanumeric identifiers, for example "A320" or "P/N".
const _WORDLIKE_RE = /[A-Za-z]/;
const _DIGIT_RE = /\d/;

// Spans that rules 8.5 and 8.6 each count as one word.
const _PARENTHESES_RE = /\([^()]*\)/g;
const _QUOTED_RE = /[“‘"][^”’"]*[”’"]/g;

// Sentence-ending punctuation. Rule 8.4 makes a colon end a sentence too.
const _SENTENCE_SPLIT_RE = /(?<=[.!?:])[ \t]+(?=["“(]?[A-Z0-9])|(?<=[.!?:])$/g;
// Abbreviations whose period does not end a sentence.
const _NON_TERMINAL = new Set(
  splitWhitespace(
    "no nos fig figs ref refs vol ch sec para pp approx max min dia qty " +
      "mr mrs ms dr st jr sr inc ltd co corp dept est etc vs cf al ed eds",
  ),
);

/**
 * Replace each span that counts as one word with a single placeholder.
 *
 * Rule 8.5 counts text in parentheses as one word. Rule 8.6 counts quoted
 * text as one word. Collapsing them before splitting on whitespace is what
 * makes the count match how the standard says to count.
 */
export function collapseSpans(sentence) {
  return sentence.replace(_PARENTHESES_RE, " paren ").replace(_QUOTED_RE, " quote ");
}

/**
 * Count the words in one sentence the way rules 8.4 thru 8.7 require.
 *
 * - Text in parentheses: one word (8.5).
 * - Quoted text: one word (8.6).
 * - A number, with its unit of measurement if it has one: one word (8.6).
 * - An abbreviation or alphanumeric identifier: one word (8.6).
 * - A hyphenated word: one word (8.7).
 */
export function countWords(sentence) {
  const tokens = splitWhitespace(collapseSpans(sentence)).filter(countable);
  let total = 0;
  let index = 0;
  while (index < tokens.length) {
    const token = stripChars(tokens[index], ".,;:!?");
    index += 1;
    // A number followed by a unit is a single word.
    if (_NUMBER_RE.test(token) && index < tokens.length) {
      const following = stripChars(tokens[index], ".,;:!?");
      if (UNITS.has(following.toLowerCase().replace(/°/g, "deg")) || following === "%" || following === "°") {
        index += 1;
      }
    }
    total += 1;
  }
  return total;
}

function countable(token) {
  const stripped = stripChars(token, ".,;:!?()[]\"'“”‘’-–—");
  if (!stripped) return false;
  return _WORDLIKE_RE.test(stripped) || _DIGIT_RE.test(stripped);
}

/**
 * Split a block of text into sentences.
 *
 * Rule 8.4 makes a colon end a sentence, which matters because a vertical
 * list's lead-in and its items are counted separately.
 */
export function splitSentences(block) {
  const out = [];
  for (const rawChunk of block.split("\n")) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;
    let start = 0;
    for (const match of finditer(_SENTENCE_SPLIT_RE, chunk)) {
      // The pattern's lookbehind puts match.index just after the punctuation,
      // so the sentence is everything up to that point.
      const piece = chunk.slice(start, match.index);
      if (endsSentence(piece)) {
        out.push(piece.trim());
        start = match.index + match[0].length;
      }
    }
    const tail = chunk.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out.filter(Boolean);
}

/** False when the trailing period belongs to an abbreviation. */
function endsSentence(piece) {
  if (!piece.endsWith(".")) return true;
  const words = piece.match(/[A-Za-z]+/g);
  if (!words || words.length === 0) return true;
  return !_NON_TERMINAL.has(words[words.length - 1].toLowerCase());
}

// --- The dictionary --------------------------------------------------------

/** The STE dictionary and rules, ready for lookup. */
export class Dictionary {
  constructor(data) {
    const schema = data.schema || "";
    if (!schema.startsWith(SCHEMA_PREFIX)) {
      throw new Error(`unsupported data schema '${schema}'; expected ${SCHEMA_PREFIX}*`);
    }
    this.data = data;
    this.words = data.words;
    this.forms = data.forms;
    this.limits = Object.fromEntries(Object.entries(data.limits).map(([k, v]) => [k, v.value]));
    this.rules = Object.fromEntries(data.rules.map((r) => [r.id, r]));
    this.recurring = Object.fromEntries(data.recurring_errors.map((e) => [e.non_ste.toLowerCase(), e]));
    this.approvedVerbs = new Set(data.approved_verbs.map((v) => v.toLowerCase()));
    this._participles = null;
    this._phrases = null;
    this._technical = null;
  }

  /**
   * @param {string|null} [dataPath] path to ste100-lint.json. Found beside this
   *   file when omitted.
   * @returns {Dictionary}
   */
  static load(dataPath = null) {
    const resolved = dataPath || Dictionary.find();
    return new Dictionary(JSON.parse(fs.readFileSync(resolved, "utf-8")));
  }

  static find() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const candidate of DATA_CANDIDATES) {
      const full = path.normalize(path.join(here, candidate));
      if (fs.existsSync(full)) return full;
    }
    throw new Error(
      "cannot find the STE dataset. Looked for " +
        DATA_CANDIDATES.join(", ") +
        ` under ${here}. It ships next to ste_lint.mjs, or pass --data PATH.`,
    );
  }

  /** Every dictionary entry for a spelling, or an empty list. */
  variants(word) {
    return this.words[word.toLowerCase()] || [];
  }

  /**
   * "approved", "not-approved", or "unknown" for a spelling.
   *
   * A spelling listed both ways - CHECK (n) is approved while check (v) is
   * not - counts as approved, because this tool cannot tell which part of
   * speech is meant. Rule 1.2 covers that case and needs a parser.
   */
  status(word) {
    const key = word.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(this.forms, key)) return "approved";
    const variants = this.variants(key);
    if (variants.length === 0) return "unknown";
    return variants.some((v) => v.approved) ? "approved" : "not-approved";
  }

  /** The approved alternatives the dictionary gives for a word. */
  alternatives(word) {
    const out = [];
    for (const variant of this.variants(word)) {
      if (variant.approved) continue;
      for (const sense of variant.senses || []) {
        const text = sense.alternative_text || sense.alternative;
        if (text && !out.includes(text)) out.push(text);
      }
    }
    return out;
  }

  /**
   * Past participle forms of approved verbs, for the passive-voice check.
   *
   * A verb entry lists its forms as present, simple past, past participle,
   * so the participle is the last one. Regular verbs repeat the same word
   * for the last two, which does no harm here.
   */
  pastParticiples() {
    if (this._participles === null) {
      const found = new Set();
      for (const variants of Object.values(this.words)) {
        for (const variant of variants) {
          if (variant.pos === "v" && variant.approved) {
            const forms = variant.forms || [];
            if (forms.length >= 2) found.add(forms[forms.length - 1].toLowerCase());
          }
        }
      }
      this._participles = found;
    }
    return this._participles;
  }

  /**
   * Words the dictionary itself offers as a technical noun or verb.
   *
   * An alternative marked (TN) or (TV) is the dictionary sanctioning that
   * spelling as a technical term, even for words it rejects as ordinary
   * vocabulary. Reporting such a word as forbidden would contradict the
   * dictionary's own advice, so it becomes a part-of-speech question instead.
   */
  technicalTerms() {
    if (this._technical === null) {
      const found = new Set();
      for (const variants of Object.values(this.words)) {
        for (const variant of variants) {
          for (const sense of variant.senses || []) {
            if (sense.alternative_pos === "TN" || sense.alternative_pos === "TV") {
              const term = (sense.alternative || "").trim().toLowerCase();
              if (term) found.add(term);
            }
          }
        }
      }
      this._technical = found;
    }
    return this._technical;
  }

  /**
   * Multi-word expressions that STE approves as a unit.
   *
   * Some approved entries are phrases (MAKE SURE, GO OFF), and many of the
   * alternatives the dictionary offers for a word that is not approved are
   * phrases too. Their individual words are not always approved on their own,
   * so a phrase match takes precedence over its parts.
   *
   * Longest first, so the longest match wins. Ties break alphabetically, which
   * keeps the order stable across runs and platforms.
   */
  approvedPhrases() {
    if (this._phrases === null) {
      const found = new Set();
      for (const [spelling, variants] of Object.entries(this.words)) {
        if (spelling.includes(" ") && variants.some((v) => v.approved)) found.add(spelling);
        for (const variant of variants) {
          for (const sense of variant.senses || []) {
            const phrase = (sense.alternative || "").trim().toLowerCase();
            // Keep only plain wording. An alternative with an ellipsis is a
            // template rather than a fixed phrase, and one with brackets is the
            // dictionary describing a usage rather than giving words to write.
            if (phrase.includes(" ") && /^[a-z][a-z \-]*[a-z]$/.test(phrase)) found.add(phrase);
          }
        }
      }
      this._phrases = [...found].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
    }
    return this._phrases;
  }

  /**
   * The dictionary entries for a spelling, following inflected forms.
   *
   * "connects" resolves through CONNECT, so the caller sees the verb entry
   * rather than nothing.
   */
  headword(word) {
    const key = word.toLowerCase();
    const base = this.forms[key];
    return base ? this.variants(base) : this.variants(key);
  }

  /** Every part of speech the dictionary gives this spelling. */
  partsOfSpeechOf(word) {
    const out = new Set();
    for (const v of this.headword(word)) if (v.pos) out.add(v.pos);
    return out;
  }

  /**
   * Whether a word could be part of a multi-word noun.
   *
   * True for a dictionary noun or adjective, and for any word the dictionary
   * does not list, since rule 1.5 lets that be a technical noun.
   */
  isNounCandidate(word) {
    const kinds = this.partsOfSpeechOf(word);
    if (kinds.size === 0) return true;
    return kinds.has("n") || kinds.has("adj");
  }

  /**
   * Whether this word signals that a noun follows it.
   *
   * Used to tell "drain the fuel" (a noun, permitted as a technical noun) from
   * "fuel the aircraft" (the verb the dictionary rejects).
   */
  isNounMarker(word) {
    const key = word.toLowerCase();
    if (["a", "an", "the", "this", "these", "those", "its", "their", "no", "any"].includes(key)) return true;
    if (_NUMBER_RE.test(key)) return true;
    const kinds = this.partsOfSpeechOf(key);
    return kinds.has("art") || kinds.has("prep") || kinds.has("adj");
  }
}

// --- Findings --------------------------------------------------------------

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
    return {
      path: this.path,
      line: this.line,
      column: this.column,
      severity: this.severity,
      rule: this.rule,
      message: this.message,
      text: this.text,
    };
  }
}

/** Order findings by position, then rule, then message. Matches the Python tuple sort. */
function compareFindings(a, b) {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.column !== b.column) return a.column - b.column;
  if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}

// --- Checks ----------------------------------------------------------------

export const LATIN_ABBREVIATIONS = {
  "e.g.": "FOR EXAMPLE",
  "i.e.": "THAT IS",
  "etc.": "a complete list, or “AND OTHERS”",
  "et al.": "AND OTHERS",
  "viz.": "THAT IS",
  "vs.": "COMPARED TO",
  "cf.": "REFER TO",
  "n.b.": "NOTE",
  "ca.": "APPROXIMATELY",
};
const _LATIN_RE = new RegExp(
  "(?<![A-Za-z])(" + Object.keys(LATIN_ABBREVIATIONS).map(escapeRegExp).join("|") + ")",
  "gi",
);
const _NOT_CONTRACTION_RE =
  /\b\w+n['’]t\b|\b(?:it|that|there|he|she|who|what|let)['’]s\b|\b\w+['’](?:re|ve|ll|m)\b/gi;
const _POSSESSIVE_RE = /\b([A-Za-z]+)['’]s\b/g;
const _PROGRESSIVE_RE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:not\s+|also\s+)?([a-z]+ing)\b/gi;
const _PASSIVE_RE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:not\s+|also\s+)?([a-z]+)\b/gi;
// "MAKE SURE THAT ... IS CLOSED" states a required condition. The participle
// there is an adjective (rule 3.3), not the passive voice.
const _MAKE_SURE_RE = /\bmake\s+sure\b/i;
// An agent named after the verb is what makes a construction unambiguously
// passive: "... IS INSTALLED BY THE TECHNICIAN".
const _AGENT_RE = /^\s+by\s+(?:the|a|an)?\s*[a-z]/i;
const _WORD_RE = /[A-Za-z][A-Za-z’'\-]*/g;
// Openers rule 5.4 permits before a command, and safety words from section 7.
const _CONDITION_OPENERS = new Set(
  splitWhitespace(
    "if when before after while unless until as at during for from in on to with " +
      "warning caution danger note attention notice do make put set",
  ),
);
const _STEP_RE = /^\s*(?:\(?\d+[.)]|\(?[A-Za-z][.)])\s+/;

/**
 * Check one document. Returns findings sorted by position.
 *
 * @param {string} text
 * @param {string} filePath name used in the findings
 * @param {Dictionary} dictionary
 * @param {string} [mode] "auto", "procedural", or "descriptive"
 * @param {boolean} [strict] also report words absent from the dictionary
 * @returns {Finding[]}
 */
export function checkText(text, filePath, dictionary, mode = "auto", strict = false) {
  const findings = [];
  for (const block of blocks(text)) {
    findings.push(...checkBlock(block, filePath, dictionary, mode, strict));
  }
  findings.sort(compareFindings);
  return findings;
}

/** A paragraph, with the line number each of its lines came from. */
class Block {
  constructor(lines, startLine) {
    this.lines = lines;
    this.startLine = startLine;
  }
  get text() {
    return this.lines.join("\n");
  }
}

/** Split a document into paragraphs, keeping line numbers. */
function blocks(text) {
  const out = [];
  let current = [];
  let start = 1;
  const lines = text.split("\n");
  // Python's splitlines() drops a single trailing newline's empty field.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  lines.forEach((raw, index) => {
    const number = index + 1;
    if (raw.trim()) {
      if (current.length === 0) start = number;
      current.push(raw);
    } else if (current.length > 0) {
      out.push(new Block(current, start));
      current = [];
    }
  });
  if (current.length > 0) out.push(new Block(current, start));
  return out;
}

function checkBlock(block, filePath, dictionary, mode, strict) {
  const findings = [];
  const blockMode = mode === "auto" ? modeOf(block, dictionary) : mode;

  const sentences = splitSentences(block.text);
  const limitKey =
    blockMode === "procedural"
      ? "max_words_per_procedural_sentence"
      : "max_words_per_descriptive_sentence";
  const limit = dictionary.limits[limitKey];
  const limitRule = blockMode === "procedural" ? "5.1" : "6.3";

  for (const sentence of sentences) {
    const [line, column] = locate(block, sentence);
    const words = countWords(sentence);
    if (words > limit) {
      findings.push(
        new Finding(
          filePath, line, column, "error", limitRule,
          `sentence has ${words} words; the maximum for ${blockMode} writing ` +
            `is ${limit}. Counted as rules 8.4 thru 8.7 require.`,
          sentence,
        ),
      );
    }
    findings.push(...checkSentence(sentence, block, filePath, dictionary, blockMode, strict));
  }

  const maxSentences = dictionary.limits.max_sentences_per_paragraph;
  if (blockMode === "descriptive" && sentences.length > maxSentences) {
    findings.push(
      new Finding(
        filePath, block.startLine, 1, "error", "6.6",
        `paragraph has ${sentences.length} sentences; the maximum is ${maxSentences}.`,
        block.lines[0],
      ),
    );
  }
  return findings;
}

/**
 * Guess whether a paragraph is procedural or descriptive.
 *
 * Procedural writing gives instructions in the command form. Everything else is
 * read as descriptive, which is the safer default: its sentence limit is longer
 * and its paragraph limit applies.
 */
function modeOf(block, dictionary) {
  const first = block.lines[0];
  if (_STEP_RE.test(first)) return "procedural";
  const words = first.match(_WORD_RE) || [];
  if (words.length > 0 && dictionary.approvedVerbs.has(words[0].toLowerCase())) return "procedural";
  return "descriptive";
}

function checkSentence(sentence, block, filePath, dictionary, mode, strict) {
  const findings = [];
  const [line, base] = locate(block, sentence);

  const at = (fragment) => {
    const offset = sentence.indexOf(fragment);
    return base + (offset >= 0 ? offset : 0);
  };

  // Rule 8.1: no semicolons.
  if (sentence.includes(";")) {
    findings.push(new Finding(
      filePath, line, at(";"), "error", "8.1",
      "the semicolon (;) is not permitted. Write two sentences.", sentence));
  }

  // GR-6: no Latin abbreviations.
  for (const match of finditer(_LATIN_RE, sentence)) {
    const found = match[1];
    const replacement = LATIN_ABBREVIATIONS[found.toLowerCase()];
    findings.push(new Finding(
      filePath, line, base + match.index, "error", "GR-6",
      `the Latin abbreviation "${found}" is not permitted. Use ${replacement}.`, sentence));
  }

  // Rule 4.2: no contractions.
  for (const match of finditer(_NOT_CONTRACTION_RE, sentence)) {
    findings.push(new Finding(
      filePath, line, base + match.index, "error", "4.2",
      `"${match[0]}" is a contraction. Write the words in full.`, sentence));
  }

  // Rules 3.2 and 3.5: the "-ing" form is not a permitted verb form.
  for (const match of finditer(_PROGRESSIVE_RE, sentence)) {
    findings.push(new Finding(
      filePath, line, base + match.index, "error", "3.2",
      `"${match[0].trim()}" uses the "-ing" form as a verb. Use the simple ` +
        "present, simple past, or simple future tense.", sentence));
  }

  // Rule 3.6: use the active voice. Rule 3.3 permits the past participle as an
  // adjective, which looks identical. Only a named agent settles it, so a
  // sentence with one is an error and a bare participle is a warning.
  for (const match of finditer(_PASSIVE_RE, sentence)) {
    const participle = match[1].toLowerCase();
    if (!dictionary.pastParticiples().has(participle)) continue;
    if (_MAKE_SURE_RE.test(sentence.slice(0, match.index))) continue; // a required state
    const agent = _AGENT_RE.exec(sentence.slice(match.index + match[0].length));
    if (agent) {
      findings.push(new Finding(
        filePath, line, base + match.index, "error", "3.6",
        `"${match[0].trim()}${agent[0].replace(/\s+$/, "")}" is the passive voice, ` +
          "and it names the agent. Write it as active: put the agent first.", sentence));
    } else {
      const note =
        mode === "procedural"
          ? "Procedures use the command form, so start with the verb."
          : "In descriptive writing this is permitted only when the agent is " +
            "unknown. If it describes a state rather than an action, rule 3.3 " +
            "permits it.";
      findings.push(new Finding(
        filePath, line, base + match.index, "warning", "3.6",
        `"${match[0].trim()}" may be the passive voice. ${note}`, sentence));
    }
  }

  // GR-8: the possessive form is permitted but is easy to get wrong.
  for (const match of finditer(_POSSESSIVE_RE, sentence)) {
    findings.push(new Finding(
      filePath, line, base + match.index, "warning", "GR-8",
      `"${match[0]}" is the possessive form. Make sure it is necessary and ` +
        "correct; a construction with OF is usually clearer.", sentence));
  }

  findings.push(...checkWords(sentence, filePath, line, base, dictionary, strict));
  findings.push(...checkMultiWordNouns(sentence, filePath, line, base, dictionary));

  if (mode === "procedural") {
    findings.push(...checkCommandForm(sentence, filePath, line, base, dictionary));
  }
  return findings;
}

/** Rules 1.1, 1.2 and 1.6: use approved words, technical nouns, or technical verbs. */
function checkWords(sentence, filePath, line, base, dictionary, strict) {
  const findings = [];
  const covered = phraseSpans(sentence, dictionary);
  // Text in parentheses and quoted text are still words to check, so this
  // walks the raw sentence rather than the collapsed one.
  for (const match of finditer(_WORD_RE, sentence)) {
    const word = match[0];
    const wordStart = match.index;
    const wordEnd = match.index + word.length;
    if (covered.some(([start, end]) => start <= wordStart && wordEnd <= end)) continue;
    const status = dictionary.status(word);
    const column = base + wordStart;
    if (status === "approved") continue;
    if (status === "unknown") {
      if (strict) {
        findings.push(new Finding(
          filePath, line, column, "info", "1.5",
          `"${word}" is not in the dictionary. It is permitted only if it is a ` +
            "technical noun or a technical verb in your subject field.", sentence));
      }
      continue;
    }

    const recurring = dictionary.recurring[word.toLowerCase()];
    const alternatives = dictionary.alternatives(word);
    const kinds = dictionary.partsOfSpeechOf(word);
    const shown =
      alternatives.slice(0, 4).join("; ") + (alternatives.length > 4 ? " (and others)" : "");
    const pos = kinds.size > 0 ? [...kinds].sort().join("/") : "";
    const labelled = `"${word}"` + (pos ? ` (${pos})` : "");

    // The dictionary offers this spelling as a technical noun or verb
    // somewhere, so rule 1.5 permits it in that role.
    if (dictionary.technicalTerms().has(word.toLowerCase())) {
      findings.push(new Finding(
        filePath, line, column, "warning", "1.5",
        `${labelled} is not approved as ${posName(pos)}, but the dictionary offers ` +
          `"${word.toUpperCase()}" as a technical noun or verb, which rule 1.5 permits. Make ` +
          "sure that is how it is used here.", sentence));
      continue;
    }

    // A word the dictionary rejects only as a verb is still permitted as a
    // technical noun (rule 1.5). When it follows an article, a preposition or
    // an adjective it is being used as a noun, so this reports it for
    // confirmation rather than as an error.
    const preceding = precedingWord(sentence, wordStart);
    if (kinds.size === 1 && kinds.has("v") && preceding && dictionary.isNounMarker(preceding)) {
      findings.push(new Finding(
        filePath, line, column, "info", "1.5",
        `${labelled} is not approved as a verb, and here follows ` +
          `"${preceding}", so it reads as a noun. That is ` +
          "permitted only if it is a technical noun in your subject field. As a verb, " +
          `use ${shown || "a different word"}.`, sentence));
      continue;
    }

    if (recurring) {
      findings.push(new Finding(
        filePath, line, column, "error", "1.1",
        `${labelled} is not approved in STE and is one of the most frequent errors. ` +
          `Use ${recurring.use_instead}.`, sentence));
    } else if (alternatives.length > 0) {
      findings.push(new Finding(
        filePath, line, column, "error", "1.1",
        `${labelled} is not approved in STE. Use ${shown}.`, sentence));
    } else {
      findings.push(new Finding(
        filePath, line, column, "error", "1.1",
        `${labelled} is not approved in STE. Use a different word or a different ` +
          "sentence construction.", sentence));
    }
  }
  return findings;
}

export const POS_NAMES = {
  n: "a noun",
  v: "a verb",
  adj: "an adjective",
  adv: "an adverb",
  pron: "a pronoun",
  art: "an article",
  prep: "a preposition",
  conj: "a conjunction",
  TN: "a technical noun",
  TV: "a technical verb",
};

function posName(pos) {
  if (Object.prototype.hasOwnProperty.call(POS_NAMES, pos)) return POS_NAMES[pos];
  return pos ? `(${pos})` : "used here";
}

/** The word immediately before position `index`, or "" at the start of a sentence. */
function precedingWord(sentence, index) {
  const before = sentence.slice(0, index).match(_WORD_RE);
  return before && before.length > 0 ? before[before.length - 1] : "";
}

/** Character ranges in `sentence` occupied by approved multi-word phrases. */
function phraseSpans(sentence, dictionary) {
  const spans = [];
  for (const phrase of dictionary.approvedPhrases()) {
    const pattern = new RegExp(
      "\\b" + splitWhitespace(phrase).map(escapeRegExp).join("\\s+") + "\\b",
      "gi",
    );
    for (const match of finditer(pattern, sentence)) {
      const start = match.index;
      const end = match.index + match[0].length;
      if (!spans.some(([s, e]) => s <= start && end <= e)) spans.push([start, end]);
    }
  }
  return spans;
}

/**
 * Rule 2.1: write multi-word nouns of no more than three words.
 *
 * Approximate on purpose. A multi-word noun cannot be identified for certain
 * without parts of speech in context, so this reports runs of words that are
 * all either dictionary nouns or adjectives, or absent from the dictionary.
 */
function checkMultiWordNouns(sentence, filePath, line, base, dictionary) {
  const limit = dictionary.limits.max_words_per_multi_word_noun;
  const findings = [];
  let run = [];
  const matches = [...finditer(_WORD_RE, sentence)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  for (const match of [...matches, null]) {
    // Punctuation between two words ends the run: a comma or a period is never
    // inside a multi-word noun.
    const brokenByPunctuation = Boolean(
      run.length > 0 && match && /[^\s]/.test(sentence.slice(run[run.length - 1].end, match.start)),
    );
    if (match && !brokenByPunctuation && dictionary.isNounCandidate(match.text)) {
      run.push(match);
      continue;
    }
    if (run.length > limit) {
      const phrase = sentence.slice(run[0].start, run[run.length - 1].end);
      findings.push(new Finding(
        filePath, line, base + run[0].start, "warning", "2.1",
        `"${phrase}" may be a multi-word noun of ${run.length} words; the maximum is ` +
          `${limit}. Write it in full, then give a shorter form or use hyphens ` +
          "(rule 2.2).", sentence));
    }
    run = [];
    // The word that ended the run can itself start the next one.
    if (match && brokenByPunctuation && dictionary.isNounCandidate(match.text)) run.push(match);
  }
  return findings;
}

/**
 * Rules 3.2 and 5.3: write instructions in the command form.
 *
 * A procedural sentence should begin with an approved verb, a step number, or
 * the descriptive condition that rule 5.4 permits before the command.
 */
function checkCommandForm(sentence, filePath, line, base, dictionary) {
  const stripped = sentence.replace(_STEP_RE, "").trim();
  const words = stripped.match(_WORD_RE) || [];
  if (words.length === 0) return [];
  const first = words[0].toLowerCase();
  if (dictionary.approvedVerbs.has(first) || _CONDITION_OPENERS.has(first)) return [];
  if (stripped.includes(",")) {
    // Rule 5.4: a condition, a comma, then the command. Check the command.
    const after = stripped.slice(stripped.indexOf(",") + 1).trim();
    const following = after.match(_WORD_RE) || [];
    if (following.length > 0 && dictionary.approvedVerbs.has(following[0].toLowerCase())) return [];
  }
  return [new Finding(
    filePath, line, base, "warning", "5.3",
    "this instruction does not start with an approved verb in the command form " +
      `("${words[0]}"). Refer to rules 3.2, 5.3 and 5.4.`, sentence)];
}

/** Line number and column of `fragment` inside `block`. */
function locate(block, fragment) {
  for (let offset = 0; offset < block.lines.length; offset += 1) {
    const column = block.lines[offset].indexOf(fragment.slice(0, 40));
    if (column >= 0) return [block.startLine + offset, column + 1];
  }
  return [block.startLine, 1];
}

// --- Command line ----------------------------------------------------------

function readSource(filePath) {
  if (filePath === "-") return [fs.readFileSync(0, "utf-8"), "<stdin>"];
  return [fs.readFileSync(filePath, "utf-8"), filePath];
}

const USAGE = `usage: ste_lint.mjs [-h] [--mode {auto,procedural,descriptive}] [--data DATA]
                   [--json] [--strict] [--fail-on {error,warning,info,never}]
                   [--version]
                   FILE [FILE ...]

Check text against the ASD-STE100 Simplified Technical English rules.

positional arguments:
  FILE                  file to check, or "-" for stdin

options:
  -h, --help            show this help message and exit
  --mode {auto,procedural,descriptive}
                        which sentence and paragraph limits to apply (default:
                        auto, per paragraph)
  --data DATA           path to ste100-lint.json (default: found next to this
                        file)
  --json                write findings as JSON
  --strict              also list words that are not in the dictionary at all
                        (rule 1.5)
  --fail-on {error,warning,info,never}
                        lowest severity that makes the exit status 1 (default:
                        error)
  --version             show program's version number and exit`;

export function parseArgs(argv) {
  const args = { paths: [], mode: "auto", data: null, json: false, strict: false, failOn: "error" };
  const modes = ["auto", "procedural", "descriptive"];
  const failOns = [...SEVERITIES, "never"];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    else if (arg === "--version") return { version: true };
    else if (arg === "--json") args.json = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--mode") {
      args.mode = argv[++i];
      if (!modes.includes(args.mode)) throw new Error(`argument --mode: invalid choice: '${args.mode}' (choose from ${modes.map((m) => `'${m}'`).join(", ")})`);
    } else if (arg.startsWith("--mode=")) {
      args.mode = arg.slice(7);
      if (!modes.includes(args.mode)) throw new Error(`argument --mode: invalid choice: '${args.mode}' (choose from ${modes.map((m) => `'${m}'`).join(", ")})`);
    } else if (arg === "--data") args.data = argv[++i];
    else if (arg.startsWith("--data=")) args.data = arg.slice(7);
    else if (arg === "--fail-on") {
      args.failOn = argv[++i];
      if (!failOns.includes(args.failOn)) throw new Error(`argument --fail-on: invalid choice: '${args.failOn}' (choose from ${failOns.map((m) => `'${m}'`).join(", ")})`);
    } else if (arg.startsWith("--fail-on=")) {
      args.failOn = arg.slice(10);
      if (!failOns.includes(args.failOn)) throw new Error(`argument --fail-on: invalid choice: '${args.failOn}' (choose from ${failOns.map((m) => `'${m}'`).join(", ")})`);
    } else if (arg.startsWith("--")) throw new Error(`unrecognized arguments: ${arg}`);
    else args.paths.push(arg);
  }
  if (args.paths.length === 0) throw new Error("the following arguments are required: FILE");
  return args;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (exc) {
    process.stderr.write(`${USAGE}\nste_lint.mjs: error: ${exc.message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  if (args.version) {
    process.stdout.write(`ste_lint.mjs ${VERSION}\n`);
    return 0;
  }

  let dictionary;
  try {
    dictionary = Dictionary.load(args.data);
  } catch (exc) {
    process.stderr.write(`ste_lint.mjs: ${exc.message}\n`);
    return 2;
  }

  const findings = [];
  for (const target of args.paths) {
    let text;
    let name;
    try {
      [text, name] = readSource(target);
    } catch (exc) {
      process.stderr.write(`ste_lint.mjs: ${exc.message}\n`);
      return 2;
    }
    findings.push(...checkText(text, name, dictionary, args.mode, args.strict));
  }

  const counts = Object.fromEntries(
    SEVERITIES.map((level) => [level, findings.filter((f) => f.severity === level).length]),
  );
  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          version: VERSION,
          issue: dictionary.data.standard.issue,
          counts,
          findings: findings.map((f) => f.asObject()),
        },
        null,
        1,
      ) + "\n",
    );
  } else {
    for (const finding of findings) process.stdout.write(finding.format() + "\n");
    const summary = SEVERITIES.map((level) => `${counts[level]} ${level}`).join(", ");
    process.stderr.write(`${findings.length} findings (${summary})\n`);
  }

  if (args.failOn === "never") return 0;
  const threshold = SEVERITIES.indexOf(args.failOn);
  const hit = findings.some((f) => SEVERITIES.indexOf(f.severity) <= threshold);
  return hit ? 1 : 0;
}

if (
  process.argv[1] &&
  fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])
) {
  process.exitCode = main();
}
