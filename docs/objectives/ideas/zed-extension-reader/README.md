# ZD as a Zed-native Markdown experience

- Research date: 2026-08-14
- Status: decision research, not an implementation commitment
- Upstream inspected: Zed `0ad5441b5370428eaa353a36f63c50c5448eead5` (2026-08-14)

## Bottom line

The product hypothesis is credible: ZD's calm Markdown reading and focused writing experience could
be much more useful when it lives beside code, search, Git, terminals, and AI in Zed. The proposed
implementation mechanism is not currently credible as a normal Zed extension.

Zed's public extension API can add languages, language servers, themes, snippets, debuggers, MCP
servers, and a few label/command integrations. It cannot register a custom editor, render an
interactive document surface, observe editor events directly, control scrolling, add arbitrary
decorations or widgets, or contribute GPUI views. Zed's roadmap lists webviews via extensions only
as **Triage**, and the active visual-extension proposal explicitly excludes custom editor
implementations from its first version.

That leaves four materially different options:

| Option | What it can prove or deliver | Main limitation | Recommendation |
| --- | --- | --- | --- |
| ZD theme + Zed settings profile | Measure, typography, low chrome, centered layout, wrapping, Markdown preview styling | Static appearance only; no focus behavior or rendered editing | Do first |
| Conventional extension + Markdown language server | A narrow experiment for caret-driven focus dimming using supported LSP messages | No scroll control, widgets, rich typography, raw/rendered state, or robust pre-caret behavior | Spike, then keep only if clean |
| Zed core contribution or maintained fork | Native focus, scroll anchoring, inline/block rendering, source-linked Markdown presentation | Significant Zed-core work, GPL distribution obligations, continuing merge/release cost | Explore only after the smaller experiments establish daily value |
| Existing ZD reader/editor | Full design control and the current product reference | Context switch and duplicated editor/app behavior | Keep as the control and fallback |

The key correction is therefore:

> Treat “ZD inside Zed” as a product hypothesis to validate in layers, not as a presently available
> custom-editor extension API.

## The decision we actually need to make

The question is not simply whether Zed can display Markdown. It already has an editable text editor
and a separate native Markdown preview. The decision is whether enough of ZD's distinctive value
survives inside Zed to justify one of these escalating investments:

1. a shareable ZD-flavored Zed configuration;
2. a deliberately constrained extension/LSP experiment;
3. an upstream Zed editor feature;
4. a ZD-maintained Zed fork or another native integration;
5. continued investment in the standalone Tauri surface.

The experiments must test the behaviors that make ZD more than a color theme:

- the same surface remaining readable and editable;
- line, paragraph, and section focus;
- a one-third reading anchor before editing and caret-relative focus after editing;
- typewriter-style viewport stability;
- strong heading hierarchy and bounded prose measure;
- proportional prose with monospaced code;
- links, images, tables, and fenced blocks that remain legible without losing source truth;
- instant, predictable access to raw Markdown;
- stable geometry while moving between reading and editing.

## Current ZD scope

The current Markdown mini-app is not a small theme layer. At the time of this research it contains
about 8,081 lines of TypeScript and CSS, including roughly 4,307 lines in its editor implementation,
with more than 50 directly related editor/Markdown unit and end-to-end spec files. That code embodies
interaction contracts as well as visual choices. Porting screenshots would miss most of the work.

The useful target is a compatibility envelope, not line-for-line reuse:

- preserve Markdown source as the authoritative document;
- preserve native Zed text editing, commands, collaboration, Git, and language tooling;
- add presentation only where it does not compromise editing semantics;
- keep every transformation reversible and source-position-aware;
- degrade to ordinary Markdown rather than creating a document Zed cannot safely edit.

## Recommended sequence

1. Build a stock-Zed theme/settings profile and test it on a fixed Markdown corpus.
2. Run a time-boxed language-server focus experiment, with explicit UX and performance kill
   conditions.
3. Use both in real work and record every reason a user still leaves Zed for the standalone reader.
4. If focus mode is the dominant missing capability, propose or prototype that small primitive in
   Zed core before attempting rich rendered editing.
5. Consider a native Markdown presentation layer or fork only when the evidence shows that it would
   replace enough context switching to pay for ongoing core maintenance.

The detailed gates and measurements are in [`prototype-plan.md`](prototype-plan.md).

## Research map

- [`research/extension-boundary.md`](research/extension-boundary.md) — what a supported Zed extension
  can and cannot do today, including the LSP focus experiment.
- [`research/native-core-feasibility.md`](research/native-core-feasibility.md) — which existing Zed
  internals could support a native implementation and where the hard layout problems begin.
- [`prototype-plan.md`](prototype-plan.md) — staged prototypes, success criteria, kill conditions,
  and the resulting decision records.

This is a focused follow-up to the broader
[`thinking-differently/research/zed.md`](../thinking-differently/research/zed.md) assessment. That
report remains the overview of Zed as a companion or substrate; this folder investigates the
specific Markdown reader/editor idea against current source and APIs.

## Non-decisions

This research does not recommend replacing the existing ZD app, forking Zed now, or waiting for a
future extension API. It recommends collecting the cheapest decisive evidence while keeping the
current reader as the behavioral reference.

The target experience should continue to follow [ZD's vision](../../../VISION.md) and
[design system](../../../DESIGN.md), even when an experiment intentionally supports only a subset.
