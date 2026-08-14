# Thinking differently: research index

Research snapshot: 2026-08-11

This directory is the evidence base for [`gpt-sol-thoughts.md`](../gpt-sol-thoughts.md). Each named
product from [`thoughts.txt`](../thoughts.txt) has its own evaluation. Additional documents cover
implementation choices and credible adjacent tools rather than hiding them in the synthesis.

## Host, editor, terminal, and workbench candidates

| Research | Question answered |
| --- | --- |
| [`bb.md`](bb.md) | Can bb's plugin-oriented agent IDE become ZD's substrate? |
| [`herdr.md`](herdr.md) | Can Herdr own persistent terminal and agent sessions beneath ZD? |
| [`ghostty.md`](ghostty.md) | Is Ghostty a host, companion, or future terminal engine? |
| [`warp.md`](warp.md) | Can Warp's workbench and third-party agent support absorb ZD? |
| [`zed.md`](zed.md) | Can a supported Zed extension carry ZD's custom experience? |
| [`iterm2.md`](iterm2.md) | Can iTerm2 rapidly prototype the complete hotkey/project loop? |
| [`superlogical.md`](superlogical.md) | What is public, what is promising, and what remains unknown? |
| [`t3-codes.md`](t3-codes.md) | What can ZD use or learn from T3 Code's agent control plane? |
| [`raycast.md`](raycast.md) | Is Raycast a host or a thin command/capture integration? |
| [`hammerspoon.md`](hammerspoon.md) | Can Hammerspoon cheaply validate the Mac interaction? |

## Agent harness candidates

| Research | Question answered |
| --- | --- |
| [`hermes-agent.md`](hermes-agent.md) | Should ZD reuse Hermes's complete workflow platform? |
| [`pi-agent.md`](pi-agent.md) | Is Pi a better minimal engine when ZD owns the workflow? |
| [`claude-code.md`](claude-code.md) | What supported headless/SDK seams and lock-in does Claude Code have? |
| [`codex.md`](codex.md) | Which Codex layer is suitable for a deep ZD client? |

## Architecture and implementation research

| Research | Question answered |
| --- | --- |
| [`zd-current-architecture.md`](zd-current-architecture.md) | What exists now, where are the leverage points, and what is actually missing? |
| [`architecture-options.md`](architecture-options.md) | How do five strategic directions compare, and what experiments decide among them? |
| [`comparison-matrix.md`](comparison-matrix.md) | What does the cross-candidate comparison look like in one place? |
| [`macos-global-overlay.md`](macos-global-overlay.md) | Can current Tauri/AppKit code provide the summon/hide behavior? |
| [`tauri-nspanel.md`](tauri-nspanel.md) | Is the existing Tauri panel plugin a credible native adapter? |
| [`browser-integration.md`](browser-integration.md) | Preview, browser companion, or general embedded browser? |
| [`xtermjs.md`](xtermjs.md) | What would a pragmatic embedded terminal surface use? |
| [`libghostty-vt-node.md`](libghostty-vt-node.md) | Does the proposed Ghostty Node binding actually render a terminal? |
| [`subagent-fanout.md`](subagent-fanout.md) | What parallel investigations were assigned and what did each return? |

Focused follow-up: [`ZD as a Zed-native Markdown experience`](../../zed-extension-reader/README.md)
tests whether the reader/editor styling and focus modes can live inside Zed, and separates what a
supported extension can prove from what requires Zed core or a fork.

## Research method

- Product capability claims prefer current official docs, product repositories, release notes, API
  references, and source manifests.
- Marketing claims are labeled or balanced against documented extension/API boundaries.
- An undocumented plugin or embedding API is treated as absent for architectural decisions, even if
  a fork could technically add one.
- Roadmap items are not counted as shipped contracts.
- Every report separates current evidence from unknowns and proposes a bounded spike where runtime
  behavior matters more than documentation.
- Repository claims come from the current worktree and accepted ADRs, not assumptions about the
  intended design.

## Important qualification

This is a dated snapshot of unusually fast-moving products. Before adopting a dependency or public
protocol, recheck release status, license, API stability, authentication terms, platform support, and
the specific evidence gap named in its report.
