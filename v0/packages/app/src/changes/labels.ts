import type { GitChangeState } from "@/git";

const STATE_LABELS: Readonly<Record<GitChangeState, string>> = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  renamed: "renamed",
  conflicted: "conflicted",
  untracked: "untracked",
  ignored: "ignored",
};

export function changeStateLabel(state: GitChangeState): string {
  return STATE_LABELS[state];
}

export function changeStateTone(state: GitChangeState): string {
  switch (state) {
    case "added":
    case "untracked":
      return "added";
    case "deleted":
      return "deleted";
    case "ignored":
      return "ignored";
    default:
      return "changed";
  }
}

export function changePathIcon(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "md" || extension === "mdx") return "#";
  if (["ts", "tsx", "js", "jsx", "rs", "go", "py", "rb"].includes(extension ?? "")) return "‹›";
  if (["json", "jsonc", "yaml", "yml", "toml"].includes(extension ?? "")) return "{}";
  if (["css", "scss", "less", "html"].includes(extension ?? "")) return "◫";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension ?? "")) return "□";
  return "≡";
}
