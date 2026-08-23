import type { FileTreeScrollState } from "./types";

export interface FileTreeFilterRestore {
  readonly selectedPath: string | null;
  readonly scroll: FileTreeScrollState;
}

export interface FileTreeFilterMemory {
  filterOpen: boolean;
  filterQuery: string;
  filterRestore: FileTreeFilterRestore | null;
  selectedPath: string | null;
  scroll: FileTreeScrollState;
}

export function applyFileTreeFilter(memory: FileTreeFilterMemory, query: string): boolean {
  if (memory.filterQuery === query) return false;
  if (memory.filterQuery.length === 0 && query.length > 0) {
    memory.filterRestore = {
      selectedPath: memory.selectedPath,
      scroll: { ...memory.scroll },
    };
    memory.scroll = { top: 0, left: memory.scroll.left };
  }
  memory.filterQuery = query;
  if (query.length === 0 && memory.filterRestore) {
    memory.selectedPath = memory.filterRestore.selectedPath;
    memory.scroll = memory.filterRestore.scroll;
    memory.filterRestore = null;
  }
  return true;
}

export function updateFileTreeScroll(
  memory: FileTreeFilterMemory,
  scroll: FileTreeScrollState,
): void {
  memory.scroll = { top: Math.max(0, scroll.top), left: Math.max(0, scroll.left) };
}
