export const FILE_TREE_ROW_HEIGHT = 19;
const DEFAULT_OVERSCAN_ROWS = 6;

export interface FileTreeWindow {
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly totalHeight: number;
}

/** Visible-only DOM bounds for the fixed-height compact tree. */
export function fileTreeWindow(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
): FileTreeWindow {
  const count = Math.max(0, Math.floor(rowCount));
  const top = Math.max(0, scrollTop);
  const height = Math.max(FILE_TREE_ROW_HEIGHT, viewportHeight);
  const overscan = Math.max(0, Math.floor(overscanRows));
  const firstVisible = Math.floor(top / FILE_TREE_ROW_HEIGHT);
  const visibleCount = Math.ceil(height / FILE_TREE_ROW_HEIGHT);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + visibleCount + overscan);
  return {
    start,
    end,
    offset: start * FILE_TREE_ROW_HEIGHT,
    totalHeight: count * FILE_TREE_ROW_HEIGHT,
  };
}
