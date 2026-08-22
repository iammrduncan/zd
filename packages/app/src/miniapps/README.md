# Legacy Markdown implementation

This directory contains the pre-workbench Markdown source while Gate 1 preserves equivalent
launch, editor, save, and close behavior. It is migration input, not an extension point. Do not
register another surface, add another launch identifier, or extend the old boot model.

New product work targets the single `zd` workbench defined by [`docs/VISION.md`](../../../../docs/VISION.md),
[`docs/DESIGN.md`](../../../../docs/DESIGN.md), and the
[Workbench Reorganization Goal](../../../../docs/planning/goals/expanded-scope/goal-reorganize.md).
Move shared ownership into the root workbench contracts established by that goal.

While this source remains:

- preserve semantic tokens from `src/design/tokens.css`;
- keep `src/platform.ts` as the only frontend importer of `@tauri-apps/api`;
- keep Rust commands narrow and organized by concern under `packages/tauri/src/`;
- add or update tests for every behavioral change; and
- split files at real ownership seams when they become difficult to reason about.
