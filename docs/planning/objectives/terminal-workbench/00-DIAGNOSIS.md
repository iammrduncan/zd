# Terminal workbench diagnosis

Date: 2026-09-26

This document diagnoses why the current workbench cannot be incrementally adjusted into the
requested product and which capabilities are actually distinctive.

## The current product optimizes the wrong boundary

The owner has removed three premises of the current architecture: `zd` no longer needs a served UI,
a desktop wrapper, or ownership of terminal/agent processes. The desired product is one foreground
Rust TUI inside the terminal and multiplexer the person already chose
([objective](objective.md#what-we-want)).

The current repository instead makes a browser/Tauri/host boundary authoritative. Its build,
tests, release workflow, vision, design system, and Accepted ADRs all reinforce that product
([migration findings](research/01-repository-and-migration.md#established)). Retaining that root
while adding a TUI would create two products and preserve the exact system ownership the owner has
rejected.

## Existing editors do not remove the hard part

The research compared Helix, Neovim, Kakoune, Amp/Scribe, Lapce/Floem, Fresh, `mdt`, Oride, and
focused widgets. Fresh has the closest generic behavior, but changes the runtime and license.
`mdt` is the closest visual demonstration, but its private application is Markdown-only and lacks
the required tree, project search, and mouse editing. Oride's Rust implementation is being retired.
Helix and Neovim are strong behavioral references without an acceptable product boundary
([editor findings](research/02-editor-landscape.md#established)).

The difficult part is not drawing a pane. It is one exact source selection that survives editing
and powers code editing, rendered Markdown, comments, search/replace, and agent handoff. No candidate
exports that product-specific model. A fork would add inherited assumptions without removing this
work.

## Terminal constraints change the interaction model

Terminals expose cells and protocol extensions, not browser layout. Outer selections do not identify
source offsets. Clipboard image access is a host GUI capability, not ordinary terminal paste.
Ghostty supports the needed baseline input and optional graphics, while Herdr already owns agent
discovery, panes, and prompt delivery ([terminal findings](research/03-terminal-and-multiplexer.md#established)).

Therefore:

- `zd` owns source selection, not terminal copy mode;
- Read mode and Edit mode are projections of one UTF-8 source buffer;
- graphics and image clipboard access are optional capabilities with text/error fallbacks; and
- Herdr is an integration target, not a subsystem to reproduce.

## What is worth preserving

The product character remains sound: calm, content-first, fast, local, keyboard-complete, and honest
about state. The old Rust host also contains useful behavior and tests for atomic writes, bounded
ignore-aware traversal, watchers, and image validation
([migration findings](research/01-repository-and-migration.md#established)). These are references to
re-extract, not dependencies to retain.

## Options considered

1. **Add a TUI beside v0.** Rejected because it keeps the wrong root release and authority and
   creates two active products.
2. **Extend Fresh.** Rejected because Fresh becomes the GPL host product and retains a much larger
   editor/IDE/orchestration surface than the objective permits.
3. **Fork `mdt` or Oride.** Rejected because their tree/search/editor correctness gaps still require
   replacement, while their application assumptions become inherited maintenance.
4. **Embed Neovim.** Rejected because it adds another runtime and relaxes the Rust-native constraint.
5. **Build a focused Rust TUI.** Chosen because it owns only the differentiated source model and
   integrates with the terminal ecosystem already in use.

## Cost

The focused build must implement a real editor core, coordinate conversions, source-mapped Markdown,
and mouse behavior. This is more initial work than drawing a demo with a textarea widget. It is less
total work than adopting an editor product and then replacing its state, tree, review, and workflow
boundaries.

## Not covered

This diagnosis does not specify implementation order, keyboard bindings, visual details, release
packaging, or future editor services. Those belong to the following plan documents.

