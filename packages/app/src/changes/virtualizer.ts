export const CHANGE_ROW_HEIGHT = 20;
const DEFAULT_OVERSCAN_ROWS = 6;

export interface ChangesWindow {
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly totalHeight: number;
}

/** Visible-only DOM bounds for a compact, fixed-height Changes list. */
export function changesWindow(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
): ChangesWindow {
  const count = Math.max(0, Math.floor(rowCount));
  const top = Math.max(0, scrollTop);
  const height = Math.max(CHANGE_ROW_HEIGHT, viewportHeight);
  const overscan = Math.max(0, Math.floor(overscanRows));
  const firstVisible = Math.floor(top / CHANGE_ROW_HEIGHT);
  const visibleCount = Math.ceil(height / CHANGE_ROW_HEIGHT);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + visibleCount + overscan);
  return {
    start,
    end,
    offset: start * CHANGE_ROW_HEIGHT,
    totalHeight: count * CHANGE_ROW_HEIGHT,
  };
}
