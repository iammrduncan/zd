import "@/design/index.css";

import type { DiagnosticStatus } from "@/instrumentation";
import { detectPlatform, type FileStamp, type Platform } from "@/platform";
import type { ProjectGrant } from "./resources";
import { bootWorkbench } from "./boot";

const project: ProjectGrant = {
  id: "project-fixture",
  name: "Workbench fixture",
  root: "/fixture/workbench",
  availability: "available",
  worktrees: [
    {
      id: "worktree-fixture",
      name: "main",
      root: "/fixture/workbench",
      availability: "available",
    },
  ],
};
const resource = {
  projectId: project.id,
  worktreeId: project.worktrees[0]!.id,
  relativePath: "src/main.ts",
};
let contents = "export const workbench = true;";
let stamp: FileStamp = { modified: 1, length: new TextEncoder().encode(contents).byteLength };
let diagnostics: DiagnosticStatus = {
  enabled: false,
  sessionId: null,
  backgroundSampling: false,
  problem: null,
};

const browser = detectPlatform();
const platform: Platform = {
  ...browser,
  launchRequest: async () => ({
    project,
    worktreeId: resource.worktreeId,
    relativePath: resource.relativePath,
    problem: null,
  }),
  projectGrants: async () => [project],
  diagnosticsStatus: async () => diagnostics,
  enableDiagnostics: async () => {
    diagnostics = {
      enabled: true,
      sessionId: "diagnostic-fixture",
      backgroundSampling: true,
      problem: null,
    };
    return diagnostics;
  },
  disableDiagnostics: async () => {
    diagnostics = {
      enabled: false,
      sessionId: null,
      backgroundSampling: false,
      problem: null,
    };
    return diagnostics;
  },
  recordDiagnostic: async () => ({ recorded: diagnostics.enabled, problem: null }),
  revealDiagnostics: async () => {
    document.documentElement.dataset.diagnosticsRevealed = "true";
  },
  workspaceFiles: async () => ({
    projectId: project.id,
    worktreeId: resource.worktreeId,
    root: project.root,
    files: [{ resource, relative: resource.relativePath }],
  }),
  readTextFile: async () => contents,
  readBoundedFile: async () => ({
    status: "text",
    text: contents,
    byteLength: new TextEncoder().encode(contents).byteLength,
    writable: true,
  }),
  writeTextFile: async (_resource, next) => {
    contents = next;
    stamp = {
      modified: (stamp.modified ?? 0) + 1,
      length: new TextEncoder().encode(contents).byteLength,
    };
    document.documentElement.dataset.savedText = contents;
  },
  fileStamp: async () => ({ ...stamp }),
};

const host = document.getElementById("zd");
if (!host) throw new Error("dev/workbench.html is missing the #zd host element");

void bootWorkbench(host, platform);
