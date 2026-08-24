# App source map

Status: **current implementation context (2026-08-22)**

This map helps contributors find the current code owner. It is not released-product documentation.
Start with
[`docs/VISION.md`](../../../docs/VISION.md), [`docs/DESIGN.md`](../../../docs/DESIGN.md), and the
[expanded-scope execution plan](../../../docs/planning/goals/expanded-scope/goal.md) when a change
affects behavior or architecture.

## Root ownership

| Path | Current responsibility |
| --- | --- |
| [`main.ts`](main.ts) | Detect the platform and boot one root workbench. |
| [`workbench/boot.ts`](workbench/boot.ts) | Compose the shell, shared services, feature mounts, commands, and teardown. |
| [`workbench/state.ts`](workbench/state.ts) | Export the versioned state contract and its one transition owner. |
| [`workbench/state-core.ts`](workbench/state-core.ts) | Define state data, stable identities, parsing, and pure context helpers. |
| [`workbench/state-owner.ts`](workbench/state-owner.ts) | Serialize guarded project, worktree, thread, and file transitions. |
| [`workbench/resources.ts`](workbench/resources.ts) | Define ID-scoped launch and file resources shared with native grants. |
| [`workbench/workspace-home.ts`](workbench/workspace-home.ts) | Present bare-launch project/recent-workspace selection and persist ordered project sets. |
| [`platform.ts`](platform.ts) | Be the frontend's only importer of Tauri APIs and expose narrow typed adapters. |

Treat `workbench/boot.ts`, the state facade, `platform.ts`, the command registry, and shared theme
configuration as integration-owner files. A feature should request a narrow interface change
instead of creating another state, command, or native-authority owner.

## Feature boundaries

| Directory | Current responsibility |
| --- | --- |
| [`design/`](design/) | Shared semantic roles, bundled fonts, validated themes, and appearance ownership. |
| [`projects/`](projects/) | Project-list model, controller, view, and workbench adapter contract. |
| [`instrumentation/`](instrumentation/) | Closed diagnostic schema and the local opt-in frontend client. |
| [`editor/`](editor/) | CodeMirror document mechanics, bounded buffers, languages, Markdown and Mermaid rendering, styles, Find/Replace, focus, and document-local annotations. |
| [`terminal/`](terminal/) | Structured terminal-session adapter, viewport validation, and bounded scrollback contract. |
| [`threads/`](threads/) | Project-scoped thread model, lifecycle, attention event, create flow, and terminal presentation. |
| [`files/`](files/) | Persistent compact file-tree model, controller, filtering, Git reconciliation, and virtualization. |
| [`git/`](git/) | Scoped read-only Git adapter and stable status/history/comparison reconciliation. |
| [`changes/`](changes/) | Working-tree changes, bounded history, comparisons, and read-only diff presentation. |
| [`notifications/`](notifications/) | Attention policy, local preferences, platform request schema, and outcome routing. |
| [`workbench/`](workbench/) | Root shell, state, settings surfaces, commands, and lifecycle composition. [`workbench/current-file/`](workbench/current-file/) owns bounded file reads, saving, reconciliation, dirty-close safety, and the active editor buffer. |

The native side of grants, files, Git, themes, diagnostics, quick access, terminal sessions, and
notifications is mapped
in the [native source map](../../tauri/src/README.md).

## Verification

- Pure state and boundary tests live under [`packages/app/tests/unit/`](../tests/unit/).
- Rendered interaction and accessibility evidence lives under
  [`packages/app/tests/e2e/`](../tests/e2e/).
- Native authority and lifecycle tests live beside or below the native owner; follow the
  [native source map](../../tauri/src/README.md).

Add or update the smallest test that proves a code change. Rendering and accessibility claims need
browser or native evidence in addition to pure state tests.
