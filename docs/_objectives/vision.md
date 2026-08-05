# zd md — second prototype vision

Date: 2026-07-28
Supersedes: `docs/_objectives/goals/initial-prototype/` (Rust/egui, archived at tag `rust-prototype`)
Stack decision: `docs/_internal/path-forward.md`

This document merges the original product intent (`initial-prototype/initial_thoughts.md`) with
everything the first prototype taught us in use (`initial-prototype/feedback.md`, F01–F18). The
F-findings are not carried forward as a bug ledger — they are folded in here as requirements,
stated positively. Appendix A maps them so nothing is lost.

---

## 1. Why this exists

LLM agents and coding harnesses generate enormous amounts of markdown. Execution plans, postmortems,
BDD corpora, design docs, research summaries. Reading them in a code editor is miserable, and
reading them badly is how you miss the thing that matters.

`zd md` is for kicking back and actually reading the book your agent just wrote. Not skimming it in
a sidebar at 13px with syntax highlighting fighting the prose. Reading it.

The measure of success is simple and personal: **do dreary eyes get to the end of a long agent
document and actually grok it.**

## 2. Product character

The references are iA Writer and OmmWriter. Calm, typographic, chrome-free.

- Text is the interface. No box buttons, no toolbars, no application bars, no status bars, no
  decorative controls.
- No visible titlebar plane on any window, root or secondary.
- Less is more. Every control that exists must earn its pixels.
- Nothing flashes, jumps, or reflows while you work. Motion is either immediate or eased, never
  janky.
- The app is quiet by default and reveals depth on demand.

## 3. Suite context

`zd` is the Zen Suite — one installed binary, one CLI, several focused mini apps.

Mini apps — each one a `zd <thing>` surface you launch into:

- `zd md` — markdown reader/editor. **This is tool #1 and the whole focus of this prototype.**
- `zd td` — todo lists. Likely next.
- `zd bdd`, `zd mer`, `zd studio`, `zd init` — later.

The terminal is **not** a mini app. It is a suite facility: an in-app terminal that opens over
whatever mini app or studio you are already in, on an in-app hotkey to show/hide plus a global
hotkey that foregrounds the app and opens it. There is no sense in opening a terminal from a
terminal. See [`docs/_objectives/goals/zd-terminal/`](goals/zd-terminal/initial_thoughts.md).

Consequence for this prototype: the design system, settings, window shell, and shortcut registry
are **suite-owned**, not md-owned. Changing a token changes every mini app. Two structural
obligations follow:

1. Adding mini app #2 tomorrow must be cheap.
2. Surfaces that overlay a mounted mini app — the terminal, the Shortcut Reference — belong to the
   suite, not to `md`. They live in `src/suite/`, and a mini app must not have to cooperate with
   them or even know they exist.

## 4. The document — the core experience

There is one surface and no modes. A document is always rendered and always editable: opening one
drops you straight into it, and you can type without asking for permission first. Nothing switches,
so there is nothing to switch back from.

Always edit, but readerly. The typography, focus, and calm of a reader are the resting state; the
caret is simply there when you want it.

### 4.1 Focus

The heart of the product. The part you are reading stays at full contrast while everything else is
visibly dimmed — dimmed, not hidden, so you keep your place in the shape of the document.

- Focus granularity is selectable: line, paragraph, or section.
- A paragraph and the code block directly under it take focus together. The sentence that
  introduces a command and the command are one thing to read, so at paragraph granularity they are
  one target from either end. Reported twice against the same README line, the second time as
  blocking; DESIGN.md §7.6 carries the exact rule and why it is not a fourth granularity.
- **The caret is the focus target.** Place it and that is where focus goes.
- Before a caret is placed, focus follows the vertical reading anchor and scrolling moves it. The
  anchor sits above the middle of the window, roughly a third of the way down, where the eye rests
  when reading rather than where a ruler would put it. Once the caret is in the document, scrolling
  for context leaves focus where it is — reading ahead is not the same as moving.
  <!-- This read "the vertical anchor at the centre of the screen" until 2026-07-30. Taken
  literally that is the geometric midpoint, it was implemented there, and it was wrong in use: a
  document opened halfway down the window and the anchor sat below where anyone was reading. The
  ratio is the decision and this sentence follows it. -->
- A document opens with its first block on the anchor, not at the top of the window and not
  centred. Where a document opens and where focus is read from are the same position, or the first
  pixel of scroll jumps focus several blocks at once.
- The pointer's resting position is never a focus target. Where the mouse happens to sit says
  nothing about where you are reading.
- Incoming focus is immediate. Outgoing focus eases out. Focus should feel like attention moving,
  not like a spotlight snapping.
- How much everything else dims is a user setting, from barely-there to near-black.

### 4.2 Typography

This is where the first prototype failed hardest, so it is specified hardest. Reading typography is
product behavior, not polish — and because there is one surface, it is the typography you edit in
too, not a preview you leave.

- **Hierarchy must be immediately legible.** A heading must read as a heading at a glance, at a
  size and weight that separates it from prose without shouting.
- **Ordered and unordered lists must read as lists**, not as left-aligned text that happens to start
  with a number or a dot. Markers are proportioned to the prose — never oversized. Item text has a
  clear indent, and soft-wrapped continuation lines return to the item's text origin, not to the
  left margin.
- **Inline code sits on the prose baseline** and shares the surrounding line rhythm, with a
  restrained semantic distinction only.
- **Inline code inside a heading keeps the heading's size and baseline.** It does not drop to body
  inline-code size.
- **Fenced code blocks render as coherent code passages** — a distinct plane, no visible fence
  characters, and language-appropriate syntax highlighting when a language is declared.
- Blockquotes, horizontal rules, tables, and images all have a deliberate resting state.
- Measure, leading, and vertical rhythm are tuned for long sessions on both retina and low-quality
  external displays.

### 4.3 Navigation inside a document

- Relative links to other workspace documents **navigate inside the reader.** Only genuine external
  `http(s)` links cross into the system browser.
- Back/forward history for in-reader navigation.
- Document outline, reachable by keyboard, that navigates on selection.
- Find in document.

### 4.4 Composition

- Column splits: wrap a long document into 2, 3, or more columns so a wide window is readable
  instead of a single 200-character line. `cmd+[` removes a split, `cmd+]` adds one. Not `cmd+|` —
  that collides with macOS and 1Password.
- The column count reclamps when the font size changes and the requested count no longer fits, and
  restores the requested count when it fits again.
- Font size up/down with `cmd+=` / `cmd+-`.

## 5. Workspace and navigation

### 5.1 Sidebar

Extremely minimal, Zed-like. Monospaced. Collapsible, and movable to either side.

- Markdown files only by default; a toggle reveals everything else.
- Ignored and hidden paths stay out.
- Git-aware when the folder is a repo: added, changed, and deleted files are marked. Toggleable.

### 5.2 Quick Open

`cmd+k` opens a fuzzy finder over the current workspace. Type, arrow, enter.

- One stable plane while typing. The window must never flash, expose a blank frame, reorder paint
  layers, or show the underlying document between queries.
- Keyboard-only operation with no pointer required.

### 5.3 Home

Bare `zd md`, or launching from Spotlight / the Dock / the Start menu, shows a minimal home screen:
pick a folder, pick a file, create a file, or reopen something recent.

## 6. Typing in the document

Everything that makes reading good stays true while you type. This is not a second mode — §4 is
the surface, and this is what it does when a caret is in it.

### 6.1 Markdown notation

Elegant like iA Writer. Focus works exactly as in §4.1, because it is the same surface.

- **Only short notation stays literal. Everything else renders.** Decided 2026-07-29, replacing an
  earlier rule that kept every marker on screen at all times. The surface is neither a source view
  nor a preview: it shows the markers a reader absorbs without effort, and renders the ones whose
  raw form is simply unreadable.
  - **Stays literal** — a heading's `#`, list markers `-` and `1.`, a quote's `>`, the single
    backticks around inline code, and emphasis delimiters. Each is a character or two, and seeing
    it costs nothing.
  - **Renders** — links show their label with no brackets or destination, tables draw as tables,
    fenced code takes the code plane with no fence characters and no language tag, images resolve,
    horizontal rules draw as rules. Tables are the case that forced this: a raw pipe table is not
    something a person reads.
- **The notation that stays lives outside the prose column.** A heading's `#` sits in the gutter,
  to the left of the text edge, so the reading column stays a clean straight line. Notation you can
  see is honest; notation that dents the measure is not.
- Unordered items show their literal `-`, not a typeset bullet.
- **Raw mode is a toggle, and it is off by default.** It reveals the literal source of everything
  in the renders list — brackets, destinations, pipes, fences, language tags — for when you need to
  see the file exactly as it is written. Nothing else changes: same calm, same measure, same focus.
  Notation is never revealed by caret proximity; the toggle is the only thing that moves.
- Source typography does not break prose rhythm. A markdown file should not be meaningfully harder
  to read because it also happens to be editable.
- **Structure continues as you type it, the way a chat composer does.** Typing `>` and a space
  makes a blockquote; Enter continues it; a second Enter leaves it. A fence and its optional
  language open a code block on Enter, and a second Enter closes it.
- **Underscores inside an identifier stay literal.** `HEADING_SENTINEL_01-rollout-plan` is a name,
  not emphasis.
- Typewriter mode is available as a toggle: the caret line holds its vertical position while the
  document moves under it.
- Word wrap is an explicit setting with a keyboard shortcut, and it persists. It is always
  available — there is no mode in which wrapping stops being a choice.

### 6.2 Files that are not markdown

A non-markdown file opens on the same surface, rendered as code: mono family, no markdown parsing,
language-appropriate highlighting. The calm, the measure, the focus, and the theme are unchanged —
what differs is only that the file is not markdown, and it is not treated as if it were.

This is a convenience, not a second product. It does not need to become an IDE.

### 6.3 Saving

- `cmd+s` saves. Writes are atomic.
- Unsaved state is visible without adding chrome.
- External changes to an open file are detected and reconciled, not silently clobbered.

## 7. Controls and settings

Few, and all of them meaningful:

- Theme: dark, light, follow system.
- Blue-light / warmth filter.
- Focus dim amount.
- Focus granularity.
- Prose font size, code font size, heading scale.
- Word wrap.
- Sidebar side and visibility.
- Settings persist across restarts.

### 7.1 Shortcuts

- `cmd+.` shows the Shortcut Reference over the current context **for as long as it is held**, and
  releasing it restores that context unchanged. It must never blank the window.
  <!-- This read "opens … and pressing it again restores that context" until 2026-07-30, when the
  decision came back as hold-to-view: "esc is set to close shortcut menu, when releasing cmd+.
  should just close it. esc should be set to unfocus the editor (caret goes away)." F02's actual
  requirement — the context comes back untouched — is unaffected; only what ends the sheet changed.
  The consequence is that the Reference no longer owns Escape, because it cannot still be on screen
  when a separate key could be pressed. Escape is the editor's. -->
- The Reference is a thing you glance at, not a mode you enter. Nothing in it is interactive, so
  there is nothing a hold prevents you from doing.
- The Reference reads like a compact rendered markdown table: hotkeys in restrained inline-code
  style, descriptions in prose, consistent row rhythm, minimal scrolling. Two aligned columns.
- **Every shortcut shown as available actually executes its named command.** A binding that cannot
  run in the current context is presented honestly rather than displayed as working.
- There is one shortcut registry. The Reference renders it; it is not a hand-maintained list that
  drifts from reality.

## 8. Typography and fonts

Unchanged from the first prototype — this part was right.

Two bundled families, never fetched, SIL OFL 1.1:

- **iA Writer Quattro** — prose, headings, actions, supporting text, general interface text.
  Faces: `iAWriterQuattroV.ttf` (variable upright), `iAWriterQuattroV-Italic.ttf` (drawn italic),
  `iAWriterQuattroS-Bold.ttf` (static bold).
- **iA Writer Mono** — sidebar, file paths, markdown markers, inline code, fenced code, code
  editing. Face: `iAWriterMonoS-Regular.ttf`.

Rules that carry over:

- No synthetic bold, synthetic italic, faux oblique, or stroke expansion.
- Strong containing emphasis resolves to the shipped upright Bold face. There is no combined
  Bold Italic role and no synthesized slant.
- Missing glyphs fall through the platform chain preserving the owning role's family class, size,
  line height, weight, style, and colour.
- The families are suite-owned. A mini app selects a semantic type role; it never substitutes a
  family.

`DESIGN.md` remains the canonical design system and its §5.2 type-role table is the source of truth
for the CSS custom properties.

## 9. Launch and platform

- `zd md .` — open the current folder.
- `zd md <file>` — open that file, creating it if it does not exist.
- `zd md` — home screen.
- Opening the app from Spotlight, the Dock, or the Start menu behaves like bare `zd md`.
- macOS is the primary target. Windows is supported. Linux is best-effort.
- `.md` file association so double-clicking a markdown file opens it here.
- Multiple windows, each with its own document and state.

## 10. Performance

"Extremely fast and responsive" is the standard. Concretely:

- Cold launch to first meaningful frame in roughly 300ms.
- Opening a multi-megabyte agent log does not stall the UI.
- Scrolling stays smooth in long documents.
- Typing latency is imperceptible.
- Idle CPU is near zero — this app sits open all day.

## 11. Explicitly out of scope for this prototype

Recorded so they do not creep back in mid-build:

- Signing, notarization, SmartScreen, WinGet, clean-machine trust evidence.
- Release-evidence manifests, evidence ledgers, traceability generators.
- Coverage ratchets and reference-hardware performance certification.
- Exhaustive BDD scenario conversion. The `.feature` corpus is archived; behavior is specified here
  and verified by focused tests.
- Plugin systems, sync, collaboration, publishing, PDF export.
- Mini apps other than `md`, and the suite-level in-app terminal — though the structure must not
  fight either of them.

## 12. How we know it is right

Not a certification program. Three things:

1. **Focused automated tests.** Unit tests for logic; browser tests for layout and visual claims —
   computed styles, element geometry, transition timing. Every bug gets a failing test first.
2. **Real use.** The prototype is correct when it is what I actually open to read agent markdown,
   every day, without wishing I had used something else.
3. **A short native checklist** per phase for the things a browser test cannot see: window
   behavior, file dialogs, CLI launch, file association.

---

## Appendix A — first-prototype findings, folded in

| Finding | Where it now lives |
| --- | --- |
| F01 links leave the reader | §4.3 |
| F02 Shortcut Reference blanks the window | §7.1 |
| F03 word wrap needs a setting and shortcut | §6.1, §7 |
| F04 focus reader behavior absent | §4.1 |
| F05 markdown editing typography hard to read | §6.1 |
| F06 intraword underscores misread as formatting | §6.1 |
| F07 inline code off the baseline | §4.2 |
| F08 fenced blocks render like malformed inline code | §4.2 |
| F09 bullet size does not match the prose | §4.2 |
| F10 inline code inside headings broken | §4.2 |
| F11 column split shortcuts conflict with macOS | §4.4 |
| F12 page hierarchy and ordered lists unclear | §4.2 |
| F13 Quick Open flashes while typing | §5.2 |
| F14 feedback ledger not being closed | process — replaced by `docs/_objectives/FEEDBACK.md`, see `docs/_internal/path-forward.md` |
| F15 Shortcut Reference typography cramped | §7.1 |
| F16 displayed shortcuts do not all execute | §7.1 |
| F17 tests and evidence miss shipped behavior | §12 |
| F18 unit and design coverage incomplete | §12 |

## Appendix B — what the first prototype got right

Worth keeping in view so it is not rediscovered:

- The product thesis. Focused reading of agent markdown is a real, daily, unsolved pain.
- `DESIGN.md` as a single suite-owned design system.
- The iA Writer Quattro / Mono pairing and the no-synthetic-faces rule.
- Chrome-free, titlebar-free composition.
- The three launch forms and the home screen.
- Refusing to fabricate evidence, and red-first regression discipline.
