import "@/design/index.css";

import type { Platform } from "@/platform";
import { mountCurrentWorkspace } from "..";
import type { FileResource, ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

const root = "/workspace";
const project: ProjectGrant = {
  id: "project-fixture",
  name: "workspace",
  root,
  availability: "available",
  worktrees: [
    {
      id: "worktree-fixture",
      name: "workspace",
      root,
      availability: "available",
    },
  ],
};
const resource = (relativePath: string): FileResource => ({
  projectId: project.id,
  worktreeId: project.worktrees[0]!.id,
  relativePath,
});
const documents = new Map([
  ["README.md", "# Workspace readme\n\nThe first document in the folder."],
  ["plans/roadmap.md", "# Roadmap\n\nThe second document in the folder."],
  [
    "plans/this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
    "# Long document\n\nA file-tree overflow fixture.",
  ],
]);

const platform: Platform = {
  kind: "browser",
  launchRequest: async () => ({
    project,
    worktreeId: project.worktrees[0]!.id,
    relativePath: null,
    problem: null,
  }),
  onOpenRequested: () => () => {},
  pendingOpenRequest: async () => null,
  acceptOpenRequest: async () => null,
  projectGrants: async () => [project],
  chooseProject: async () => null,
  recoverProjectGrant: async () => null,
  removeProjectGrant: async () => project,
  themeConfigFiles: async () => [],
  registerGlobalSummon: async () => ({
    supported: false,
    registered: false,
    shortcut: "CmdOrCtrl+Shift+Space",
    problem: null,
  }),
  onWindowPresentationChanged: () => () => {},
  toggleQuickAccess: async () => "ordinary",
  hideQuickAccess: async () => "ordinary",
  diagnosticsStatus: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: null,
  }),
  enableDiagnostics: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: "unavailable",
  }),
  disableDiagnostics: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: null,
  }),
  recordDiagnostic: async () => ({ recorded: false, problem: null }),
  revealDiagnostics: async () => {},
  workspaceFiles: async () => ({
    projectId: project.id,
    worktreeId: project.worktrees[0]!.id,
    root,
    files: [
      { resource: resource("README.md"), relative: "README.md" },
      { resource: resource("plans/roadmap.md"), relative: "plans/roadmap.md" },
      {
        resource: resource(
          "plans/this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
        ),
        relative: "plans/this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
      },
    ],
  }),
  readTextFile: async (file) => {
    const source = documents.get(file.relativePath);
    if (source === undefined) throw new Error(`missing fixture document: ${file.relativePath}`);
    return source;
  },
  writeTextFile: async (file, contents) => {
    documents.set(file.relativePath, contents);
  },
  fileStamp: async () => null,
  onCloseRequested: () => () => {},
  closeWindow: async () => {},
  openExternal: async () => {},
};

const host = document.getElementById("zd");
if (!host) throw new Error("dev/workspace.html is missing the #zd host element");

const launch = await platform.launchRequest();
await mountCurrentWorkspace(host, {
  launch,
  platform,
  state: createWorkbenchStateOwner(workbenchStateFromGrants([project], launch)),
});
