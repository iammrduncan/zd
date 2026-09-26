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

const ICON_CLASSES: Readonly<Record<FileCategory, string>> = {
  directory: "codicon-folder",
  markdown: "codicon-markdown",
  code: "codicon-code",
  config: "codicon-settings-gear",
  data: "codicon-database",
  image: "codicon-file-media",
  text: "codicon-note",
  binary: "codicon-file-binary",
  unknown: "codicon-file",
};

export function categoryLabel(category: FileCategory): string {
  return CATEGORY_LABELS[category];
}

export function categoryIconClass(category: FileCategory): string {
  return ICON_CLASSES[category];
}

export function fileTreeEntryLabel(entry: FileTreeEntry, dirty = false): string {
  const parts = [entry.name, CATEGORY_LABELS[entry.category]];
  if (entry.gitState) parts.push(GIT_LABELS[entry.gitState]);
  if (dirty) parts.push("unsaved");
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
