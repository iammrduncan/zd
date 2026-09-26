# Terminal workbench research plan

Date: 2026-09-26

## Questions

1. What must move below `v0/`, what must remain at the repository root for the Rust product and
   repository tooling, and which paths, links, tests, and release assumptions make that migration
   unsafe to perform mechanically?
2. Should `zd` extend an existing terminal editor, embed an editor component, or build a focused
   Rust TUI, given the required file tree, workspace search, code editing, mouse selection,
   find/replace, comments, agent handoff, and Markdown reading behavior?
3. Which terminal protocols and host-integration mechanisms are actually available in Ghostty,
   Herdr, and common multiplexers for keyboard, mouse, clipboard images, graphics, pane/session
   targeting, and safe text handoff?
4. What representation can keep Markdown pleasant to read while remaining truthfully editable in
   terminal cells, and how should source-anchored comments, agent handoff, image paste, and
   `zd-images` storage behave?
5. What is the smallest coherent v1.0.1 prototype architecture and acceptance suite that proves the
   pivot without recreating a terminal multiplexer, agent runtime, browser, or general IDE?

## Why each matters

1. The requested archive boundary changes every current source and documentation path. It must
   preserve history without leaving the new build coupled to v0 or hiding active governance inside
   an archive.
2. The editor ownership decision dominates scope, correctness, licensing, and long-term maintenance.
   It determines whether the prototype is an integration, a fork, or a focused application.
3. Terminal behavior varies by emulator and multiplexer. The prototype cannot promise image paste,
   precise input, or agent delivery based on browser or GUI assumptions that the terminal cannot
   expose.
4. Markdown, comments, and screenshots are the differentiated product behavior. Their source model
   must be selected before screen layout or key bindings lock in the wrong abstraction.
5. The owner asked for a testable prototype, not research alone. A narrow vertical slice and
   falsifiable gates keep the pivot shippable.

## Lines of inquiry

1. **Repository and migration audit.** Read the current repository, build/test/release configuration,
   active planning, and accepted ADRs. Return an exact inventory of root paths, a proposed `v0/`
   boundary, link/tooling hazards, reusable Rust code if any, and gaps. Use repository files and Git
   history as primary evidence.
2. **Terminal editor landscape.** Compare Helix, Neovim, Kakoune, Amp, Lapce/Floem components, and
   focused Rust TUI editor crates where relevant. Evaluate source architecture, embeddability,
   licensing, extension points, tree/search/editing/mouse capabilities, and the cost of subtraction.
   Prefer upstream repositories and official manuals over popularity. Return a scored build-versus-
   extend decision with explicit uncertainties.
3. **Terminal, Ghostty, Herdr, and multiplexer integration.** Inspect official Ghostty material,
   Herdr source/docs, terminal protocol specifications, and relevant tmux/Zellij interfaces. Return
   verified capabilities and limitations for input, selection, clipboard/image paste, graphics,
   process or pane discovery, and sending selected text to an agent. Separate terminal standards
   from emulator-specific features.
4. **Markdown, review, and image workflow.** Research terminal Markdown renderers, syntax/parser
   libraries, source-to-screen mapping, comments/annotations, clipboard image acquisition, and safe
   project-relative asset writes. Return feasible interaction models, a recommended source model,
   security/portability constraints, and prototype-level behavior.
5. **Rust TUI architecture and verification.** Compare Ratatui/Crossterm and credible alternatives;
   inspect text-buffer, syntax, search, filesystem, watcher, and test support. Return two concrete
   architectures, a recommended minimal module boundary, dependency risks, performance constraints,
   and an end-to-end v1.0.1 test matrix.

Every return must distinguish established facts, upstream claims, inferences, and gaps. Fast-moving
claims must be dated. An unverifiable claim must be labelled instead of dropped or asserted.

## Out of scope

- Implementing or moving files during the research phase.
- Designing a terminal multiplexer, shell, terminal emulator, or agent runtime.
- Language servers, completion, debugging, Git mutation, collaboration, accounts, or network service.
- Claiming identical typography or inline graphics across terminals that do not expose the needed
  capabilities.
- Selecting dependencies from star counts or demos alone.

## Known constraints

- Owner direction requires a native Rust TUI, no served UI, no owned agent/runtime system, and the
  current product archived below `v0/`.
- The prototype must prioritize file-tree mechanics, project-wide search, code editing with keyboard
  and mouse, selection comments and agent handoff, current-file find/replace, Markdown reading,
  collapsible navigation, and image-to-`./zd-images` insertion.
- [`VISION.md`](../../../../VISION.md) and [`DESIGN.md`](../../../../DESIGN.md) remain binding until
  this owner-directed pivot replaces them. Their calm, content-first, local-first character is
  reusable; their browser, host, Tauri, CodeMirror, and region contracts conflict with the pivot.
- Suite ADRs 0001, 0002, 0005–0010, Markdown ADRs 0001–0004, and repository ADRs 0004–0005 must be
  reviewed for supersession or continued applicability before implementation.
- [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md) requires two designs, a small working
  slice, deep modules, explicit security defaults, measured optimization, and tests at real system
  boundaries.
- Research is read-only. It will not install, run, or add candidate dependencies.
