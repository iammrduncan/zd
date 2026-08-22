# Prototype and decision plan

Research date: 2026-08-14

## Goal

Determine the smallest Zed integration that preserves enough of ZD's reader/editor value to change
daily behavior. The plan deliberately separates a compelling product experience from the mechanism
used to build it.

| Candidate | Cost to learn | Fidelity ceiling | Reversible? | Decision it informs |
| --- | --- | --- | --- | --- |
| Theme/settings profile | Hours to a few days | Low | Yes | Does ZD's static reading environment improve Zed enough to use? |
| Existing-preview source patch | Days to weeks | High reader fidelity | Mostly | Does Zed's existing preview become a sufficient ZD reader with focus, anchors, and source handoff? |
| Language-server focus spike | Several days | Low–medium | Yes | Is contextual focus itself valuable in Zed's source editor? |
| Daily-use trial | One to two weeks | Whatever prototypes provide | Yes | Which missing behaviors cause real context switching? |
| Direct editing in rendered content | Multi-week to multi-month | Highest | No cheap exit | Is preview/editor handoff still costly enough to justify a new input model? |

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

## Stage 2: existing-preview source-build spike

Modify Zed's compiled-in `MarkdownPreviewView` rather than creating another Markdown renderer or
custom editor.

### Deliverables

- ZD reader typography, bounded measure, spacing, and calm chrome in the native preview;
- line, paragraph, and section focus using rendered elements and their source ranges;
- one-third reading-anchor behavior with clear suspension during manual scrolling;
- source-editor selection tracking in the existing Follow mode;
- click and keyboard actions that return to the precise source range for editing;
- settings that preserve stock preview behavior when disabled;
- focused tests added to Zed's existing Markdown preview test module.

### Reuse requirements

- keep the existing source `Editor` and buffer authoritative;
- keep Zed's current Markdown parser, render entity, image cache, links, search, and task-item logic;
- extend the current normal, side-by-side, and Follow preview modes;
- do not introduce a second Markdown parser, webview, or editor stack;
- do not implement direct text input in the preview during this stage.

### Success gate

The enhanced preview replaces the standalone ZD reader for ordinary reading and review sessions,
focus/anchor behavior remains stable while the source changes, and activating rendered content
makes editing in the source editor feel like one continuous workflow.

### Kill conditions

- source mapping is too coarse for predictable return-to-editor behavior;
- focus or anchor state jumps during normal preview refreshes;
- changes require invasive edits outside the Markdown and Markdown-preview crates;
- the preview cannot match the core reader typography or layout without duplicating the renderer;
- upstream maintainers reject the generic feature shape and the measured value does not justify a
  maintained patch.

## Optional comparison: language-server focus spike

This experiment is no longer the preferred reader implementation. Run it only when a supported,
installable comparison is worth the extra work. Keep the server intentionally tiny: Markdown
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

Passing this gate means a supported source-editor focus mode may be useful alongside the enhanced
preview. It does not authorize expanding the language server into a rendered editor.

## Stage 3: daily-use trial

Use the enhanced native preview and normal Zed source editor for real Markdown work while keeping
the current ZD reader one shortcut away. Each exit from Zed should produce a tiny observation:

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

## Stage 4: refine the preview/editor handoff

If the reader succeeds but users still leave because editing feels disconnected, improve the seam
between `MarkdownPreviewView` and its existing source `Editor` before adding input to the preview.

Scope:

- precise click-to-source and keyboard-to-source activation;
- source selection reflected as the active rendered element;
- preview position restoration after a source editing round trip;
- an efficient single-pane toggle and a stable side-by-side workflow;
- actions/settings that fit Zed rather than encode ZD branding;
- focused tests around edits, buffer switches, preview refresh, and scroll restoration.

Do not add text input, cursor painting, IME, multi-cursor behavior, or mini-editors to the preview in
this stage. First determine whether a well-designed round trip makes direct editing unnecessary.

### Success gate

- handoff feels continuous in both single-pane and side-by-side use;
- selection and scroll restoration remain stable across edits and reparses;
- the change is architecturally acceptable to Zed maintainers or small enough to carry temporarily;
- the exit log shows that remaining problems truly require editing inside rendered content.

## Stage 5: direct-editing decision

Only reach this stage if the enhanced reader is valuable and the measured preview/editor handoff,
rather than app-level behavior or habit, remains the dominant reason to leave Zed.

Choose explicitly among:

1. add narrowly scoped edit affordances to individual preview constructs;
2. embed or project the normal editor into locally revealed preview ranges;
3. build an editor-level Markdown presentation mode and accept its typography limits;
4. preserve the enhanced preview plus normal editor as the intentional product model;
5. maintain a ZD-specific Zed fork with release and GPL compliance ownership;
6. stop because direct editing does not repay the input, layout, and maintenance surface.

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
- assume source mappings automatically give the preview complete editor semantics;
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

Start with Stage 0 and Stage 1, then make Stage 2 the first native experiment. The existing preview
already solves rendering and source synchronization, so adding reader focus, anchors, styling, and
source activation has a much better information-to-cost ratio than building an editor presentation
layer. Treat the language-server spike as an optional supported-extension comparison, not a gate for
the preview work.
