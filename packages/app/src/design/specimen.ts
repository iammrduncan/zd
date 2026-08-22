import "./index.css";
import "./specimen.css";

import { setTheme } from "./appearance";

/*
 * The type specimen. A design tool, not part of the app — it has its own Vite
 * entry and never ships in the product bundle.
 *
 * Every row is read out of the stylesheet at runtime rather than listed here.
 * A hand-written specimen drifts: you add a role to tokens.css, forget to add
 * it here, and the page keeps looking complete while covering less than it
 * claims. Enumerating the tokens means the specimen cannot be out of date.
 */

const PANGRAM = "Handgloves quickly vex the jumping zebra fox";
const PROSE =
  "The window is the document. Text sits on a calm plane with nothing competing " +
  "for attention, and hierarchy comes from typography and space rather than from " +
  "rules, boxes, or chrome.";

/**
 * Every custom property defined anywhere in the loaded stylesheets, in the
 * order the stylesheet declares them — which is DESIGN.md's table order, since
 * tokens.css is a transcription of those tables. Sorting alphabetically instead
 * would scatter the heading ladder and bury prose, and the whole point of the
 * page is comparing roles against each other.
 */
function declaredTokens(): string[] {
  const names = new Set<string>();

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet; nothing of ours lives there
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      for (const property of Array.from(rule.style)) {
        if (property.startsWith("--")) names.add(property);
      }
    }
  }

  return [...names];
}

const tokens = declaredTokens();

/**
 * Role stems that declare a full type role, e.g. "prose", "h1", "inline-code".
 *
 * Keyed on `-family` rather than `-size` deliberately: prose and code take their
 * size from the two adjustable knobs, which are declared above the role table,
 * so keying on size would list them out of order. Every role declares a family,
 * and those are declared in §5.2 table order.
 */
function typeRoles(): string[] {
  return tokens
    .map((token) => /^--type-(.+)-family$/.exec(token)?.[1])
    .filter((role): role is string => Boolean(role));
}

/** Semantic colour roles, grouped by their DESIGN.md §4.3 family. */
function colourRoles(): string[] {
  return tokens.filter((token) => /^--(surface|text|line|state)-/.test(token));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title: string, note: string): HTMLElement {
  const wrapper = el("section", "specimen-section");
  wrapper.append(el("h2", "specimen-section-title", title));
  wrapper.append(el("p", "specimen-section-note", note));
  return wrapper;
}

function typeRow(role: string): HTMLElement {
  const row = el("div", "specimen-row");
  row.dataset.role = role;

  row.append(el("div", "specimen-label", `type.${role}`));

  const sample = el("div", "specimen-sample");
  sample.style.fontFamily = `var(--type-${role}-family)`;
  sample.style.fontSize = `var(--type-${role}-size)`;
  sample.style.lineHeight = `var(--type-${role}-line)`;
  sample.style.fontWeight = `var(--type-${role}-weight)`;
  sample.style.fontStyle = `var(--type-${role}-style)`;
  // Headings and short roles read better as the pangram; prose roles need a
  // paragraph before you can judge measure, rhythm, and colour together.
  sample.textContent = role.startsWith("prose") ? PROSE : PANGRAM;
  row.append(sample);

  const metrics = el("div", "specimen-metrics");
  row.append(metrics);

  // Resolved after layout so the numbers are what the engine actually used.
  //
  // One decimal, because the heading ratios are rounded and land a hundredth
  // off — h1's line computes to 38.01, not 38. That drift is real but it is not
  // what you are here to look at, and h5's genuine 27.5 still shows in full.
  requestAnimationFrame(() => {
    const computed = getComputedStyle(sample);
    const size = parseFloat(computed.fontSize).toFixed(1).replace(/\.0$/, "");
    const line = parseFloat(computed.lineHeight).toFixed(1).replace(/\.0$/, "");
    const style = computed.fontStyle === "italic" ? " italic" : "";
    metrics.textContent = `${size} / ${line} · ${computed.fontWeight}${style}`;
  });

  return row;
}

function colourRow(token: string): HTMLElement {
  const row = el("div", "specimen-row specimen-row--colour");
  row.dataset.token = token;

  row.append(el("div", "specimen-label", token.replace(/^--/, "").replace("-", ".")));

  const swatch = el("div", "specimen-swatch");
  swatch.style.background = `var(${token})`;
  row.append(swatch);

  const value = el("div", "specimen-metrics");
  row.append(value);

  requestAnimationFrame(() => {
    value.textContent = getComputedStyle(swatch).backgroundColor;
  });

  return row;
}

function themeControls(): HTMLElement {
  const bar = el("div", "specimen-controls");
  bar.append(el("span", "specimen-label", "theme"));

  for (const mode of ["system", "light", "dark", "dracula"] as const) {
    const button = el("button", "specimen-button", mode);
    button.dataset.mode = mode;
    button.addEventListener("click", () => {
      setTheme(mode);

      for (const other of bar.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other.dataset.mode === mode));
      }
    });
    button.setAttribute("aria-pressed", String(mode === "system"));
    bar.append(button);
  }

  return bar;
}

const host = document.getElementById("specimen");
if (!host) throw new Error("dev/specimen.html is missing the #specimen host element");

host.append(themeControls());

const type = section(
  "Type roles",
  "DESIGN.md §5.2. Every role the stylesheet declares, at its own size, line, weight, and family.",
);
for (const role of typeRoles()) type.append(typeRow(role));
host.append(type);

const colour = section(
  "Colour roles",
  "DESIGN.md §4.3. Switch the theme above — System resolves to Light or Dark, never a third look.",
);
for (const token of colourRoles()) colour.append(colourRow(token));
host.append(colour);
