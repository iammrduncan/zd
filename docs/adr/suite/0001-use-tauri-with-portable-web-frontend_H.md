# 0001: Use Tauri with a portable web frontend

## Status

Accepted

## Context

`zd md` needs a native desktop application and a fast browser development path. Text layout and
editing behavior change more often than operating-system integration.

The first Rust/egui prototype mixed product behavior with custom layout and window code. The
[path-forward record](../../_internal/path-forward.md) shows why that structure amplified changes.

## Decision

We will use Tauri v2 as the first desktop application shell. We will build the product surface with
TypeScript, CodeMirror, DOM layout, and CSS.

The frontend will run in a normal browser for development and browser tests. Tauri will supply
windows, launch events, local file authority, external URL opening, and native packages.

The Rust backend will remain small. It will contain platform authority and operations that a
browser must not perform.

## Consequences

- Browser development can verify most product behavior without packaging a native application.
- The browser engine supplies mature text layout and editing behavior.
- Native and frontend code need explicit IPC contracts.
- The repository must test TypeScript and Rust.
- A later shell can reuse the frontend when it implements the same platform boundary.
