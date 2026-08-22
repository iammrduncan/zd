import type { FileCategory, FileGitState, FileTreeEntry, FileTreeLoadState } from "./types";

const CATEGORY_LABELS: Readonly<Record<FileCategory, string>> = {
  directory: "folder",
  markdown: "Markdown file",
  code: "code file",
  config: "configuration file",
  data: "data file",
  image: "image file",
  text: "text file",
  binary: "binary file",
  unknown: "file",
};

const GIT_LABELS: Readonly<Record<FileGitState, string>> = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  renamed: "renamed",
  conflicted: "conflicted",
  untracked: "untracked",
  ignored: "ignored",
  submodule: "submodule changed",
};

const ICONS: Readonly<Record<FileCategory, string>> = {
  directory: "▱",
  markdown: "#",
  code: "‹›",
  config: "⋮",
  data: "{}",
  image: "□",
  text: "≡",
  binary: "◇",
  unknown: "·",
};

export function categoryLabel(category: FileCategory): string {
  return CATEGORY_LABELS[category];
}

export function categoryIcon(category: FileCategory): string {
  return ICONS[category];
}

export function fileTreeEntryLabel(entry: FileTreeEntry): string {
  const parts = [entry.name, CATEGORY_LABELS[entry.category]];
  if (entry.gitState) parts.push(GIT_LABELS[entry.gitState]);
  return parts.join(", ");
}

export function fileTreeStateText(state: FileTreeLoadState): string {
  switch (state) {
    case "idle":
    case "loading":
      return "Loading files…";
    case "empty":
      return "This project is empty.";
    case "missing":
      return "The project folder is missing.";
    case "denied":
      return "Access to this project folder was denied.";
    case "not-directory":
      return "The approved project path is not a folder.";
    case "unavailable":
      return "Choose an available project to browse files.";
    case "error":
      return "The file tree could not refresh.";
    case "ready":
      return "";
  }
}
