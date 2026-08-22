# Candidate: Resolve document language before constructing the editor

## Status

Candidate. This draft is not accepted architecture.

Proposed ADR area: zd md.

## Context

Opening TypeScript, HTML, or another non-Markdown file on the Markdown surface once applied
Markdown structure to code. Headings, links, emphasis, and rules appeared where the source did not
contain those meanings. The session log then compares a Rust-only highlighting inventory with a
wider TypeScript and HTML inventory. The implemented outcome widens the inventory while retaining
one small semantic palette and honest monospace for unsupported languages.

The one-surface ADR establishes one editable CodeMirror document. It does not decide how that
surface selects a parser or prevents Markdown-only behavior from leaking into other file types.

## Decision

The proposed decision is to resolve a document language from its path before constructing the
editor and pass that resolved value into the editor.

Only `.md` and `.markdown` files will enable Markdown parsing, notation, continuation, and
Markdown-specific editing behavior. Other files will use the same document surface without
Markdown behavior.

Syntax highlighting will use a small, explicit, bundled inventory shared by fenced code and whole
code documents. The initial inventory is Rust, the JavaScript and TypeScript family, and HTML. It
will map grammars onto the suite's keyword, string, and comment roles. Unknown languages will
remain uncolored monospace text. Adding a grammar or a semantic color role will require a
deliberate edit to this inventory and the design system.

## Consequences

- Non-Markdown source is never reinterpreted as Markdown for display or editing.
- A fenced language and a file extension consult the same language inventory and palette.
- Bundled parsers avoid a plain-to-colored flash after first paint.
- Unsupported files remain readable and source-honest.
- Every supported grammar increases package size and test scope, so language growth remains
  explicit.

## Evidence and ADR overlap

- Session evidence: the highlighting comparison and unresolved decision handoffs at 2026-08-03
  16:50 and 16:52.
- Current evidence: `editor/language.ts` resolves Markdown separately from code, while
  `editor/highlight.ts` owns the explicit Rust, JavaScript/TypeScript, and HTML inventory.
- Provenance note: the reviewed session log ends at the human decision prompt, but the current
  design authority and committed implementation record the expanded outcome. A maintainer should
  confirm that provenance when promoting this candidate.
- Related accepted ADRs: md 0001 chooses CodeMirror and md 0002 chooses one document surface. This
  candidate defines parser selection within that surface.
