# 0001: Rebuild zd md on a browser text engine

## Status

Accepted

## Summary

Rebuild `zd md` as a TypeScript application on a thin Tauri shell. Use the browser engine for text
layout and keep operating-system authority behind one small platform boundary.

## Motivation

The Rust/egui prototype proved the product idea but required a custom document layout system.
Typography fixes amplified across large rendering modules, generated evidence, duplicated feature
files, and native review artifacts. The prototype produced more verification machinery without
producing a reliable daily reader.

The complete evidence and cost comparison are in the
[path-forward record](../_internal/path-forward.md).

## Proposal

- Build the reading and editing surface with TypeScript, CodeMirror, DOM layout, and CSS.
- Use Tauri v2 for the first desktop shell and keep its Rust backend thin.
- Put native calls behind one frontend platform module.
- Keep the frontend portable enough to run in a browser during development.
- Preserve the first Rust prototype on the `rust-prototype` tag.
- Replace executable specification duplication with focused unit, browser, native, and packaging
  tests at real boundaries.

## Alternatives

- Finish the Rust/egui implementation and continue maintaining custom text layout.
- Use Python with Qt and accept a different limited document-layout surface.
- Use Electron and accept its larger runtime and distribution footprint.
- Keep the Tauri shell but distribute native API calls throughout the frontend.

## Effects

### Positive

- Browser layout handles headings, lists, inline code, columns, and wrapping directly.
- The product can iterate in a browser without waiting for native packaging.
- The native authority surface remains small and reviewable.
- CodeMirror supplies viewport rendering and mature editing behavior for long documents.

### Negative

- The project now builds and tests both TypeScript and Rust.
- WKWebView and WebView2 can render small details differently.
- Tauri introduces an IPC boundary that needs explicit contracts and validation.

### Neutral

- The design system, product findings, fonts, and useful prototype evidence remain applicable.
- A later desktop-shell change can preserve the frontend if the platform boundary stays narrow.

## If we do not adopt this proposal

The project must continue building and debugging a document layout engine inside a desktop GUI
toolkit. Typography work remains the primary cost and change amplifier.

## Resulting ADRs

- [Suite ADR 0001: Use Tauri with a portable web frontend](../adr/suite/0001-use-tauri-with-portable-web-frontend_H.md)
- [Suite ADR 0002: Put native authority behind one platform boundary](../adr/suite/0002-put-native-authority-behind-platform-boundary_H.md)
- [md ADR 0001: Use browser layout for Markdown](../adr/md/0001-use-browser-layout-for-markdown_H.md)
