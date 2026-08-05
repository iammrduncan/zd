/**
 * The Document Status Strip — DESIGN.md §7.10.
 *
 * "The sole sanctioned bottom strip", and the only place vision §6.3's unsaved
 * state can honestly be shown: §7.4 forbids a persistent dirty indicator in the
 * document, so the surface that says it has to be one that is not always there.
 *
 * Three properties do all the work, and each is a rule rather than a taste:
 * it exists only after its command, it leaves after ten seconds, and it never
 * reserves layout space. Together they are what keeps it from becoming the
 * permanent status area §7.10 forbids in its last paragraph — a strip that
 * lingers is a status bar that has not noticed yet.
 *
 * Appearance is entirely in styles/md.css. This file decides when the strip
 * exists and what it says, never what it looks like.
 */

/** §7.10: "disappears after ten seconds". */
const DWELL_MS = 10_000;

/**
 * Keyed off the host rather than held in a module variable, so two documents on
 * one page cannot cancel each other's strip. There is only one today; a shared
 * mutable timer is the kind of thing that is correct until it silently is not.
 */
const timers = new WeakMap<HTMLElement, number>();

/**
 * Words per minute, for the read time.
 *
 * A decision rather than a measurement, so it is named once here instead of being
 * divided by at each call — the failure this repo keeps finding is one number
 * written down twice and drifting.
 *
 * 200 is the commonly cited average for careful silent reading of prose, and
 * careful is the right end of the range for what this app opens: specs, notes, and
 * agent logs are read to be understood rather than skimmed. Publishing estimates
 * often use 250–265, which would make every document look a fifth quicker than it
 * is. Erring slow is the honest direction for a number a reader uses to decide
 * whether they have time.
 */
const WORDS_PER_MINUTE = 200;

/** How the strip reports the buffer it is describing. */
export interface BufferReport {
  words: number;
  characters: number;
  lines: number;
  dirty: boolean;
}

/**
 * Count the words in `text`.
 *
 * Whitespace-separated runs, which is the count a writer means. Deliberately not
 * a grapheme or CJK-aware count: this is a status line, and a number that is
 * wrong in a way nobody can see is worse than a simple one that is honest about
 * what it measures.
 */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Count the lines in `text`.
 *
 * Newline-separated, which is what the editor's own `doc.lines` says — a status
 * line that disagreed with the document it describes would be worse than no line
 * count at all. So `"a\n"` is two lines: the second is empty and the caret can sit
 * on it, and an empty buffer is one, because there is always somewhere to type.
 */
export function lineCount(text: string): number {
  return text.split("\n").length;
}

/**
 * How long `words` takes to read, as short as it can honestly be said.
 *
 * Feedback, 2026-07-30: "Just show '4m' or soemthing like that, no details but if
 * someone sees a time on a stat they know what it is." So no label — a duration on
 * a line of counts reads as a reading time without one, and a label would be the
 * detail that was asked not to be there.
 *
 * Rounded **up**, so a document with a sentence in it reads as `1m` rather than
 * `0m`. Rounding down would tell a reader that something takes no time, which is
 * the one thing a reading estimate must never say about text that exists.
 *
 * Hours above sixty minutes, because §10's multi-megabyte agent logs reach them
 * and `184m` is not a number anyone converts at a glance from a line that leaves
 * after ten seconds. The remainder is dropped when it is zero so the common case
 * stays two characters.
 */
export function readTime(words: number): string {
  const minutes = Math.ceil(words / WORDS_PER_MINUTE);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * The one line, composed. §7.10: "It reports the live buffer, including unsaved
 * changes."
 *
 * Separated from showing it so the sentence can be unit-tested without a DOM,
 * and so the wording lives next to the count it describes.
 *
 * Ordered raw counts first, then the one derived value, then the state. The read
 * time is words divided by a rate rather than a count of anything, so it sits
 * after the things it is derived from and before the saved state, which is not
 * about size at all.
 */
export function statusLine({ words, characters, lines, dirty }: BufferReport): string {
  const number = new Intl.NumberFormat();
  return [
    `${number.format(words)} words`,
    `${number.format(characters)} characters`,
    // Singular at one, because a status line that says "1 lines" is the kind of
    // small wrongness §2 spends its whole list avoiding.
    `${number.format(lines)} ${lines === 1 ? "line" : "lines"}`,
    readTime(words),
    dirty ? "unsaved" : "saved",
  ].join(" · ");
}

/**
 * Put the strip on screen, or refresh the one already there.
 *
 * Summoning it again replaces the line and restarts the ten seconds rather than
 * adding a second strip — §7.10: notices "do not become stacked toasts".
 */
export function showStatus(host: HTMLElement, report: BufferReport): void {
  showLine(host, statusLine(report));
}

/**
 * Say one thing, on the strip the status already uses.
 *
 * §7.10 puts read state "at the Document" and forbids stacked toasts, so a notice
 * about the file goes through the same element and the same dwell as the word
 * count rather than growing a second surface of its own. A second strip would be
 * exactly the chrome §7.4 rules out.
 */
export function showNotice(host: HTMLElement, message: string): void {
  showLine(host, message);
}

function showLine(host: HTMLElement, text: string): void {
  let strip = host.querySelector<HTMLElement>(".md-status");
  if (!strip) {
    strip = document.createElement("p");
    strip.className = "md-status";
    host.append(strip);
  }

  strip.textContent = text;

  window.clearTimeout(timers.get(host));
  const leaving = strip;
  timers.set(
    host,
    window.setTimeout(() => {
      leaving.remove();
      timers.delete(host);
    }, DWELL_MS),
  );
}

/** Take the strip away now, and forget its timer. Used when the document unmounts. */
export function clearStatus(host: HTMLElement): void {
  window.clearTimeout(timers.get(host));
  timers.delete(host);
  host.querySelector(".md-status")?.remove();
}
