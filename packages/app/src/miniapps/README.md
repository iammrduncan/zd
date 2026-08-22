# Legacy Markdown source location

Status: **active migration seam, not current architecture**

The application now boots the root workbench. This directory still holds retained Markdown and
CodeMirror behavior needed by that workbench, so it is migration input, not an extension point. Do
not add another application surface, launch identifier, or sibling feature here.

Use the [app source map](../README.md) to choose the current owner. In particular:

- [`editor/index.ts`](../editor/index.ts) is the public frontend boundary for editor behavior;
- [`editor/surface.ts`](../editor/surface.ts) deliberately adapts retained CodeMirror code and
  Markdown styles from this directory; and
- [`workbench/current-file.ts`](../workbench/current-file.ts) still uses the retained close and
  external-change reconciliation helpers.

Those imports are known relocation seams, not a reason for new workbench code to depend on this
path. Move one coherent behavior at a time behind its current owner, preserve its tests, and avoid a
drive-by directory rewrite.

The current product and implementation direction live in [`docs/VISION.md`](../../../../docs/VISION.md),
[`docs/DESIGN.md`](../../../../docs/DESIGN.md), and the
[expanded-scope execution plan](../../../../docs/planning/goals/expanded-scope/goal.md). Historical
source and fixtures remain evidence for behavior that the workbench must preserve; they do not
restore the former extension model.
