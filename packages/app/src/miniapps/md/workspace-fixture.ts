import "@/design/index.css";

import type { Platform } from "@/platform";
import { md } from ".";

const root = "/workspace";
const documents = new Map([
  ["/workspace/README.md", "# Workspace readme\n\nThe first document in the folder."],
  ["/workspace/plans/roadmap.md", "# Roadmap\n\nThe second document in the folder."],
  [
    "/workspace/plans/this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
    "# Long document\n\nA file-tree overflow fixture.",
  ],
]);

const platform: Platform = {
  kind: "browser",
  launchRequest: async () => ({ miniapp: "md", path: root }),
  onOpenRequested: () => () => {},
  acceptOpenRequest: async () => null,
  workspaceFiles: async () => ({
    root,
    files: [
      { path: "/workspace/README.md", relative: "README.md" },
      { path: "/workspace/plans/roadmap.md", relative: "plans/roadmap.md" },
      {
        path: "/workspace/plans/this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
        relative: "plans/this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
      },
    ],
  }),
  readTextFile: async (path) => {
    const source = documents.get(path);
    if (source === undefined) throw new Error(`missing fixture document: ${path}`);
    return source;
  },
  writeTextFile: async (path, contents) => {
    documents.set(path, contents);
  },
  fileStamp: async () => null,
  onCloseRequested: () => () => {},
  closeWindow: async () => {},
  openExternal: async () => {},
};

const host = document.getElementById("zd");
if (!host) throw new Error("dev/workspace.html is missing the #zd host element");

await md.mount(host, {
  launch: await platform.launchRequest(),
  platform,
});
