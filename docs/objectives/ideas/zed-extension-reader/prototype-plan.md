# Prototype and decision plan

Research date: 2026-08-14

## Goal

Determine the smallest Zed integration that preserves enough of ZD's reader/editor value to change
daily behavior. The plan deliberately separates a compelling product experience from the mechanism
used to build it.

| Candidate | Cost to learn | Fidelity ceiling | Reversible? | Decision it informs |
| --- | --- | --- | --- | --- |
| Theme/settings profile | Hours to a few days | Low | Yes | Does ZD's static reading environment improve Zed enough to use? |
| Language-server focus spike | Several days | Low–medium | Yes | Is contextual focus itself valuable in Zed? |
| Daily-use trial | One to two weeks | Whatever prototypes provide | Yes | Which missing behaviors cause real context switching? |
| Upstream native focus spike | Days to weeks | Medium | Mostly | Can the dominant behavior become a clean Zed primitive? |
| Native rendered Markdown | Multi-week to multi-month | High, except hard typography limits | No cheap exit | Is deep integration worth sustained core ownership? |

## Stage 0: freeze the comparison contract

Before implementing anything, create a stable fixture corpus and behavior checklist from the current
ZD reader.

The corpus should include:

- a long prose document with all heading levels;
- short and long paragraphs, hard breaks, blockquotes, nested lists, and task lists;
- inline code, fenced code with language labels, and long unwrapped code lines;
- internal, external, broken, and autolinks;
- local, remote, missing, wide, and tall images;
- simple and wide tables;
- HTML, footnotes, horizontal rules, and deliberately malformed Markdown;
- Unicode, bidirectional text, emoji, combining marks, and very long words;
- enough content to expose scroll anchoring and incremental-render performance.

Record reference behavior for:

- line, paragraph, and section focus boundaries;
- focus before a caret exists and after a caret exists;
- one-third reading anchor and typewriter motion;
- transitions between raw and rendered states;
- selection, copy/paste, undo/redo, find/replace, and multi-cursor edits;
- layout movement when images load or constructs enter edit state;
- keyboard and screen-reader reachability.

This fixture becomes shared evidence for the Zed profile, language server, native spike, and the
existing app. Do not tune each implementation against a different “good-looking” sample.

## Stage 1: stock Zed profile

### Deliverables

- a ZD-derived Zed theme using the warm neutral palette and restrained syntax colors;
- documented Markdown-specific settings for centered layout, bounded soft wrap, hidden chrome,
  readable line height, and preview prose/code fonts;
- a reversible settings snippet or profile that does not unexpectedly alter other languages;
- screenshots and notes against every corpus category.

### Questions

- Is the normal editable buffer calm enough for focused writing when chrome and measure are fixed?
- Is the split between editable source and native preview acceptable for reading?
- Which ZD font choices are available on target systems, and what are safe fallbacks?
- Which settings can be scoped to Markdown and which are necessarily global?

### Success gate

Proceed if users voluntarily keep Markdown in Zed longer and the profile does not degrade code
editing. Static visual polish alone is not success; it must reduce switching to the standalone
reader.

### Kill conditions

- essential settings are global and make normal programming materially worse;
- the profile requires undocumented settings or repeated manual state changes;
- native preview/editor switching is more disruptive than the current app switch;
- typography and measure remain unacceptable even after using supported settings.

## Stage 2: language-server focus spike

Implement only after the stock profile is stable. Keep the server intentionally tiny: Markdown
parsing, caret inference from document-highlight requests, focus-range selection, and one output
transport.

### Variant order

1. Try `Hint` + `Unnecessary` diagnostics for ranges outside the target.
2. If diagnostics leak into UI or tooling, remove the variant rather than masking every leak.
3. Try semantic-token refresh only if preserving enough syntax distinction is demonstrably possible.
4. If neither path is clean, record the result and stop; do not invent a private extension API.

### Measurements

- cursor-to-focus latency at median, p95, and worst case;
- parse/update time for small, medium, and large fixtures;
- amount of document state resent or repainted per caret move;
- flicker during key repeat, typing, undo, and rapid buffer switching;
- diagnostic/status/panel/agent leakage;
- behavior with other Markdown language features enabled;
- focus correctness after structural edits and malformed Markdown.

### Success gate

The focused range follows ordinary cursor movement without visible lag, no diagnostic fiction
appears to the user or tools, and at least one focus scope is preferred over the same theme without
focus during real writing sessions.

Passing this gate means “native focus deserves investigation.” It does not authorize expanding the
language server into a rendered editor.

## Stage 3: daily-use trial

Use the best supported prototype for real Markdown work while keeping the current ZD reader one
shortcut away. Each exit from Zed should produce a tiny observation:

| Observation | Example classification |
| --- | --- |
| What task was underway? | drafting, reading, reviewing, navigating, editing a table |
| What caused the exit? | typography, focus, image/table rendering, navigation, raw syntax, app behavior |
| Was the exit avoidable? | missing capability, bug, habit, or preference |
| How long until returning? | brief lookup, focused reading session, rest of task |
| Would a small native primitive fix it? | yes/no and the smallest plausible primitive |

At the end of the trial, rank missing capabilities by observed exits, not by visual ambition. Stop if
the Zed profile already captures most value or if the app-level qualities users need are unrelated
to the editor surface.

## Stage 4: upstream native focus spike

If focus/viewport behavior dominates the exit log, prototype the smallest general Zed editor
feature in a source build.

Scope:

- line, paragraph, and syntax-node focus ranges;
- composable fading that retains syntax colors, selections, diagnostics, and collaboration marks;
- an optional caret or reading anchor with clear suspension during manual scroll;
- commands/settings that fit Zed rather than encode ZD branding;
- focused tests around wrapping, multi-cursor, edits, buffer switches, and scroll restoration.

Do not include rendered Markdown, mixed fonts, tables, or images in this patch. Those additions would
make it impossible to tell whether a broadly useful focus feature is independently mergeable.

### Success gate

- behavior is stable across the fixture and normal code buffers;
- the change is architecturally acceptable to Zed maintainers or small enough to carry temporarily;
- upstream feedback gives a credible path rather than indefinite dependence on a private patch;
- daily-use evidence still shows a meaningful improvement over Stage 2.

## Stage 5: rendered-presentation decision

Only reach this stage if the exit log shows that rendered constructs, not focus alone, remain the
dominant reason to leave Zed.

Choose explicitly among:

1. contribute reusable inline/block presentation primitives upstream;
2. build a uniform-metric native Markdown presentation mode and accept its typography limits;
3. maintain a ZD-specific Zed fork with release and GPL compliance ownership;
4. preserve the standalone reader and improve handoff between ZD and stock Zed;
5. stop because the extra fidelity does not repay the maintenance surface.

Before implementation, write a short decision record covering:

- the observed exits it will remove;
- the source/presentation editing contract;
- the supported Markdown subset and fallback behavior;
- selection, undo, accessibility, collaboration, and raw-mode invariants;
- upstream strategy;
- licensing, packaging, update, security, and regression ownership;
- a yearly maintenance budget and an exit plan.

## No-go list

Do not:

- call a theme a custom editor;
- make diagnostics a permanent hidden UI protocol without proving zero leakage;
- build a general extension UI ABI as a prerequisite for this product question;
- add a webview to Zed solely to embed ZD's web editor;
- replace the normal editor with the existing read-only preview;
- fragment a document into many mini-editors to fake mixed typography;
- fork before a supported prototype and daily-use log establish the missing value;
- make rendered state mutate or become more authoritative than Markdown source;
- wait for roadmap issues without a usable path in the meantime.

## Required decision records

Each stage should leave a compact artifact in this folder:

- configuration and screenshots or reproducible capture steps;
- benchmark numbers and tested Zed commit/version;
- observed failures and killed variants;
- daily-use exit summary;
- go/stop decision with the next bounded question.

This keeps the investigation useful even if Zed's APIs change. Future work can rerun the tests
against a newer extension contract instead of restarting from product intuition.

## Recommended first action

Start with Stage 0 and Stage 1. They have the highest information-to-cost ratio, create no platform
dependency, and make the later focus comparison honest. In parallel with ordinary use—but not as a
shipping promise—prepare the smallest possible Stage 2 server to learn whether Zed's existing fade
path is clean enough for a one-week experiment.
