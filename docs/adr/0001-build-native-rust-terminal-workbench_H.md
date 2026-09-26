# 0001. Build a native Rust terminal workbench

Date: 2026-09-26

## Status

Accepted by owner direction. This decision supersedes the archived browser/Tauri platform decision
and the later served-host and owned-terminal direction recorded in the
[`v0` ADR set](../../v0/docs/adr/README.md).

## Context

The previous application combined a browser frontend, Tauri desktop shell, local host service,
network-serving mode, and owned terminal processes. That system is capable, but its runtime and
interface are larger than the focused workflow now required.

The user already works inside a terminal multiplexer with active coding agents. The useful product
surface is file navigation, editing, Markdown reading, review, and deliberate agent handoff. Owning a
browser, HTTP service, shell, PTY, or agent lifecycle duplicates the surrounding environment and
increases security and failure surface.

## Decision

Build `zd` v1 as one native Rust foreground terminal application. Use Ratatui for projection and
Crossterm for the portable terminal event/lifecycle boundary. Treat enhanced terminal protocols as
optional capabilities, never baseline requirements.

Archive the complete previous product under `v0/`. Root builds, tests, documentation, workflows,
and release identity apply only to v1. The archive remains runnable from its own directory but is
not a dependency of the v1 application.

`zd` integrates with existing agents through narrow external adapters. The first supported adapter
is Herdr. `zd` does not create, stop, attach, or supervise shells, PTYs, multiplexers, or agents.

## Consequences

The v1 dependency and runtime surface becomes smaller, launch stays inside the user's current
terminal, and terminal/session ownership remains with tools built for it. The application must
restore terminal state reliably and must provide useful fallbacks when mouse, clipboard, enhanced
keys, or an agent adapter is unavailable.

The archive creates a clear compatibility boundary: old browser and desktop features do not carry
forward implicitly. Reusing behavior requires a deliberate Rust port with current tests; v1 cannot
link to archived crates or run archived build steps.
