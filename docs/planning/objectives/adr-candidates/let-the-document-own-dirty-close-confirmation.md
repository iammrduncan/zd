# Candidate: Let the current file own dirty-close confirmation

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: Workbench.

## Context

The native shell knows when the operating system asks a window to close. Only the document knows
whether closing would discard unsaved work. Early close handling either closed immediately,
treated a second close request as confirmation, or relied on `window.confirm`, which WebKit did
not visibly present in the desktop application.

The accepted save ADR keeps dirty state truthful across asynchronous writes. It does not define
what a close request may do with that state.

## Decision

The proposed decision is to let the platform report close requests while the active document owns
the destructive choice.

A clean document will close immediately. A dirty document will keep the window open and show one
in-app alert dialog with explicit Cancel and Close actions. Cancel will receive initial focus, and
Escape will cancel. Repeated close requests will refocus the existing dialog rather than create a
duplicate or imply consent. Only the explicit Close action will discard the buffer and invoke the
platform close operation.

## Consequences

- Native and keyboard close paths use the same dirty-state rule.
- Cancel remains safe under repeated shortcuts and preserves the exact buffer.
- The confirmation is visible and testable across desktop webviews.
- The document UI owns dialog accessibility and wording.
- Any future file-owning feature needs an equivalent explicit policy before it can discard state.

## Evidence and ADR overlap

- Session evidence: the close regression and redesign handoffs from 2026-08-01 03:53 through
  05:33, culminating in the visible in-app dialog.
- Current evidence: the workbench current-file owner adapts the retained close-confirmation module
  and delegates only the accepted close to the platform callback.
- Related accepted ADRs: md 0003 governs successful saves; suite 0002 governs native operations
  behind the platform boundary. This candidate connects those boundaries for destructive close.
