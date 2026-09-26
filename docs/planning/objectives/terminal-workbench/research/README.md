# Terminal workbench research

Date: 2026-09-26

Status: **complete; ready to plan**

## Documents

| Document | Answers |
| --- | --- |
| [Research plan](00-research-plan.md) | Questions, evidence standard, and inquiry boundaries |
| [Repository and migration](01-repository-and-migration.md) | Exact `v0/` boundary and cutover hazards |
| [Editor landscape](02-editor-landscape.md) | Build, extend, or fork decision |
| [Terminal and multiplexer](03-terminal-and-multiplexer.md) | Ghostty, Herdr, protocol, and fallback contract |
| [Markdown, review, and images](04-markdown-review-and-images.md) | Canonical source, rendering, comments, and image paste |
| [Rust architecture](05-rust-prototype-architecture.md) | Prototype modules, dependencies, bounds, and evidence |
| [Raw reports](subagent_outputs/) | Unedited specialist evidence behind these conclusions |

## Headline conclusions

Build a focused MIT Rust TUI rather than fork an editor. Existing editors either lack the required
extension seam, impose a different runtime or license, or leave the same source-mapping and review
work unsolved. Ratatui/Crossterm should remain the thin terminal layer; an application-owned Ropey
document must own selection, edits, find/replace, and review anchors.

Archive the current product as a runnable `v0/` island, but leave repository operator tooling and
the license at the root. The new root must have a fresh Cargo product, release workflow, vision,
design contract, and successor ADRs; it must not depend on archived crates.

`zd` runs inside Herdr or another terminal multiplexer. It does not own agents, PTYs, shells, or
sessions. Herdr 0.9.1 is the first semantic handoff adapter. Generic hosts fall back to an explicit
prepared prompt.

Markdown uses one source buffer and separate rendered Read and literal Edit projections. Comments
and handoff share exact source anchors. Image paste is an explicit same-host capability that writes
hashed PNGs to the active document's `./zd-images/`; remote and unsupported clipboards fail without
changing the buffer.

## Question status

1. **Archive boundary:** answered. Move the old product/build/docs/release island; keep root operator
   tooling and generated state out of the archive.
2. **Build or extend:** answered. Build focused; use other editors as behavioral evidence.
3. **Terminal contract:** answered for the portable baseline and Herdr adapter; nested interactive
   behavior remains an acceptance test.
4. **Markdown/review/image model:** answered for v1.0.1; advanced inline graphics and rename repair
   remain deferred.
5. **Prototype architecture:** answered. The complete test matrix is defined in the raw architecture
   report and will be reduced to release-blocking v1.0.1 gates in the plan.

## Owner decisions before planning

None. The owner already decided the material architecture: Rust, native TUI, no served UI, no owned
runtime, and an archived v0. The remaining choices are implementation decisions within that
direction and have evidence-backed defaults.

The owner should know that clipboard images cannot be promised over arbitrary SSH/multiplexer
stacks, and that Read mode will be a source-mapped projection rather than browser-style concealed
editing. These constraints do not block planning.

## Conflicts with current authority

The existing root vision, design contract, and Accepted ADRs require the browser/Tauri/served-host
architecture that this owner-directed pivot replaces. They cannot remain active during
implementation. The cutover plan must archive them intact and create new root authority before
v1 code becomes authoritative.
