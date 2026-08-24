import "@/design/index.css";

import type { FileTreeScope, FileTreeWatchEvent, NativeFileTreeEntry } from "@/files";
import type { GitChangeEntry } from "@/git";
import type { DiagnosticStatus } from "@/instrumentation";
import { detectPlatform, type FileStamp, type Platform } from "@/platform";
import type { TerminalOutputBatch, TerminalSessionHandle } from "@/terminal";
import { bootWorkbench } from "./boot";
import { mountWorkbenchFeatures } from "./features";
import type { ProjectGrant } from "./resources";
import type { CentreMode } from "./state";

const projects: readonly ProjectGrant[] = [
  {
    id: "project-zd",
    name: "zd",
    root: "/workspace/zd",
    availability: "available",
    worktrees: [
      {
        id: "worktree-zd-main",
        name: "main",
        root: "/workspace/zd",
        availability: "available",
      },
      {
        id: "worktree-zd-attention",
        name: "feature/attention",
        root: "/workspace/zd-attention",
        availability: "available",
      },
    ],
  },
  {
    id: "project-notes",
    name: "agent-notes",
    root: "/workspace/agent-notes",
    availability: "available",
    worktrees: [
      {
        id: "worktree-notes-main",
        name: "main",
        root: "/workspace/agent-notes",
        availability: "available",
      },
    ],
  },
  {
    id: "project-website",
    name: "website",
    root: "/workspace/website",
    availability: "available",
    worktrees: [
      {
        id: "worktree-website-main",
        name: "main",
        root: "/workspace/website",
        availability: "available",
      },
    ],
  },
  {
    id: "project-infra",
    name: "release-infra",
    root: "/workspace/release-infra",
    availability: "available",
    worktrees: [
      {
        id: "worktree-infra-main",
        name: "main",
        root: "/workspace/release-infra",
        availability: "available",
      },
    ],
  },
];

const activeProject = projects[0]!;
const resource = {
  projectId: activeProject.id,
  worktreeId: activeProject.worktrees[0]!.id,
  relativePath: "src/main.ts",
};
const source = `import { bootWorkbench } from "./workbench/boot";
import { detectPlatform } from "./platform";

const host = document.getElementById("zd");

if (!host) {
  throw new Error("The workbench host is missing");
}

const platform = detectPlatform();

void bootWorkbench(host, platform);
`;
let contents = source;
let stamp: FileStamp = { modified: 1, length: new TextEncoder().encode(contents).byteLength };
let diagnostics: DiagnosticStatus = {
  enabled: false,
  sessionId: null,
  backgroundSampling: false,
  problem: null,
};

function file(relativePath: string, ignored = false): NativeFileTreeEntry {
  const slash = relativePath.lastIndexOf("/");
  return {
    relativePath,
    parentPath: slash < 0 ? null : relativePath.slice(0, slash),
    name: relativePath.slice(slash + 1),
    kind: "file",
    ignored,
    byteLength: 420,
    modified: 1,
  };
}

function directory(relativePath: string, ignored = false): NativeFileTreeEntry {
  return { ...file(relativePath, ignored), kind: "directory", byteLength: null };
}

let fileEntries: readonly NativeFileTreeEntry[] = [
  directory(".github"),
  directory(".github/workflows"),
  file(".github/workflows/release.yml"),
  directory("docs"),
  directory("docs/screenshots"),
  file("docs/screenshots/first.png"),
  directory("docs/user-facing-docs"),
  file("docs/user-facing-docs/README.md"),
  directory("packages"),
  directory("packages/app"),
  directory("packages/app/src"),
  file("packages/app/src/platform.ts"),
  directory("src"),
  directory("src/design"),
  file("src/design/themes.ts"),
  directory("src/editor"),
  file("src/editor/index.ts"),
  directory("src/files"),
  file("src/files/controller.ts"),
  directory("src/git"),
  file("src/git/adapter.ts"),
  directory("src/threads"),
  file("src/threads/controller.ts"),
  directory("src/workbench"),
  file("src/workbench/boot.ts"),
  file("src/workbench/notifications.ts"),
  file("src/main.ts"),
  directory("node_modules", true),
  file(".gitignore"),
  file("AGENTS.md"),
  file("package.json"),
  file("README.md"),
  file("rust-toolchain.toml"),
];
let fileTreeRevision = 1;
const fileTreeWatchers = new Map<string, Set<(event: FileTreeWatchEvent) => void>>();

function fileTreeScopeKey(scope: FileTreeScope): string {
  return `${scope.projectId}\0${scope.worktreeId}`;
}

function publishFileTreeChange(scope: FileTreeScope): void {
  fileTreeWatchers
    .get(fileTreeScopeKey(scope))
    ?.forEach((listener) => listener({ status: "changed" }));
}

const changes: readonly GitChangeEntry[] = [
  {
    id: "change-main",
    path: "src/main.ts",
    previousPath: null,
    state: "modified",
    indexState: null,
    worktreeState: "modified",
    submodule: false,
  },
  {
    id: "change-notifications",
    path: "src/workbench/notifications.ts",
    previousPath: null,
    state: "added",
    indexState: "added",
    worktreeState: null,
    submodule: false,
  },
  {
    id: "change-docs",
    path: "docs/user-facing-docs/README.md",
    previousPath: null,
    state: "modified",
    indexState: null,
    worktreeState: "modified",
    submodule: false,
  },
  {
    id: "change-readme",
    path: "README.md",
    previousPath: null,
    state: "modified",
    indexState: null,
    worktreeState: "modified",
    submodule: false,
  },
  {
    id: "change-ignored",
    path: "node_modules",
    previousPath: null,
    state: "ignored",
    indexState: null,
    worktreeState: null,
    submodule: false,
  },
];

const browser = detectPlatform();
const terminalOutput = new Map<string, Uint8Array>();
let terminalSequence = 0;
const terminal: Platform["terminal"] = {
  start: async (request) => {
    const sessionId = `fixture-terminal-${++terminalSequence}`;
    const project = projects.find(({ id }) => id === request.projectId);
    const transcript = [
      `zd · ${project?.name ?? "project"}`,
      "$ git status --short",
      " M README.md",
      " M src/main.ts",
      "?? src/notifications.ts",
      "",
      "$ npm run check",
      "types · lint · unit",
      "all checks passed",
      "",
      "$ ",
    ].join("\r\n");
    terminalOutput.set(sessionId, new TextEncoder().encode(transcript));
    return { projectId: request.projectId, worktreeId: request.worktreeId, sessionId };
  },
  onOutputReady: () => () => {},
  write: async () => {},
  resize: async () => {},
  read: async (session): Promise<TerminalOutputBatch> => {
    const bytes = terminalOutput.get(session.sessionId) ?? new Uint8Array();
    terminalOutput.set(session.sessionId, new Uint8Array());
    return {
      session,
      offset: 0,
      droppedBefore: 0,
      bytes: [...bytes],
      readError: null,
    };
  },
  pollExit: async () => null,
  terminate: async () => ({ reason: "terminated", code: null, signal: null }),
  dispose: async (session: TerminalSessionHandle) => {
    terminalOutput.delete(session.sessionId);
  },
};

const git: Platform["git"] = {
  status: async (scope) => ({
    scope,
    availability: "available",
    entries: scope.projectId === activeProject.id ? changes : [],
    truncated: false,
    problem: null,
  }),
  history: async (request) => ({
    scope: request.scope,
    availability: "available",
    commits: [
      {
        id: "5f1a0c3d82e4a6b709182a3b4c5d6e7f8091a2b3",
        parentIds: ["4e0f9b2c71d3e5a60817293a4b5c6d7e8f901a2b"],
        authorName: "Duncan",
        authoredAt: 1_787_372_800,
        subject: "integrate workbench attention",
      },
      {
        id: "4e0f9b2c71d3e5a60817293a4b5c6d7e8f901a2b",
        parentIds: [],
        authorName: "Duncan",
        authoredAt: 1_787_286_400,
        subject: "render compact file tree",
      },
    ],
    nextCursor: null,
    truncated: false,
    problem: null,
  }),
  compare: async (request) => ({
    scope: request.scope,
    availability: "available",
    baseCommitId: request.baseCommitId,
    headCommitId: request.headCommitId,
    entries: [],
    truncated: false,
    problem: null,
  }),
  diff: async (request) => ({
    scope: request.scope,
    availability: "available",
    base: {
      status: "text",
      identity: `base:${request.source.changeId}`,
      path: "src/main.ts",
      revision: "HEAD",
      text: source.replace("void bootWorkbench", "bootWorkbench"),
      byteLength: source.length,
    },
    head: {
      status: "text",
      identity: `head:${request.source.changeId}`,
      path: "src/main.ts",
      revision: "WORKTREE",
      text: source,
      byteLength: source.length,
    },
    problem: null,
  }),
};

const platform: Platform = {
  ...browser,
  launchRequest: async () => ({
    project: activeProject,
    worktreeId: resource.worktreeId,
    relativePath: resource.relativePath,
    problem: null,
  }),
  projectGrants: async () => projects,
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
  terminal,
  fileTree: {
    snapshot: async (request) => {
      const revision = `fixture-tree-v${fileTreeRevision}`;
      if (request.previousRevision === revision) {
        return {
          status: "unchanged",
          projectId: request.projectId,
          worktreeId: request.worktreeId,
          revision,
          elapsedMicros: 40,
        };
      }
      return {
        status: "ready",
        projectId: request.projectId,
        worktreeId: request.worktreeId,
        revision,
        entries: request.projectId === activeProject.id ? fileEntries : [file("README.md")],
        truncated: false,
        ignoredTruncated: false,
        unreadableDirectories: 0,
        elapsedMicros: 240,
      };
    },
    mutate: async (request) => {
      const exists = (path: string) =>
        fileEntries.some(({ relativePath }) => relativePath === path);
      if (request.operation === "create") {
        if (exists(request.relativePath)) {
          return { status: "refused" as const, reason: "That name already exists." };
        }
        fileEntries = [
          ...fileEntries,
          request.kind === "directory"
            ? directory(request.relativePath)
            : file(request.relativePath),
        ];
      } else if (request.operation === "rename") {
        const slash = request.relativePath.lastIndexOf("/");
        const nextPath =
          slash < 0
            ? request.newName
            : `${request.relativePath.slice(0, slash)}/${request.newName}`;
        if (exists(nextPath)) {
          return { status: "refused" as const, reason: "That name already exists." };
        }
        fileEntries = fileEntries.map((entry) => {
          if (
            entry.relativePath !== request.relativePath &&
            !entry.relativePath.startsWith(`${request.relativePath}/`)
          ) {
            return entry;
          }
          const relativePath = `${nextPath}${entry.relativePath.slice(request.relativePath.length)}`;
          const childSlash = relativePath.lastIndexOf("/");
          return {
            ...entry,
            relativePath,
            parentPath: childSlash < 0 ? null : relativePath.slice(0, childSlash),
            name: relativePath.slice(childSlash + 1),
          };
        });
      } else if (request.operation === "copy" || request.operation === "move") {
        if (exists(request.destinationPath)) {
          return { status: "refused" as const, reason: "That destination already exists." };
        }
        const transferred = fileEntries
          .filter(
            ({ relativePath }) =>
              relativePath === request.relativePath ||
              relativePath.startsWith(`${request.relativePath}/`),
          )
          .map((entry) => {
            const relativePath = `${request.destinationPath}${entry.relativePath.slice(request.relativePath.length)}`;
            const childSlash = relativePath.lastIndexOf("/");
            return {
              ...entry,
              relativePath,
              parentPath: childSlash < 0 ? null : relativePath.slice(0, childSlash),
              name: relativePath.slice(childSlash + 1),
            };
          });
        if (request.operation === "move") {
          fileEntries = fileEntries.filter(
            ({ relativePath }) =>
              relativePath !== request.relativePath &&
              !relativePath.startsWith(`${request.relativePath}/`),
          );
        }
        fileEntries = [...fileEntries, ...transferred];
      } else {
        fileEntries = fileEntries.filter(
          ({ relativePath }) =>
            relativePath !== request.relativePath &&
            !relativePath.startsWith(`${request.relativePath}/`),
        );
      }
      fileTreeRevision += 1;
      publishFileTreeChange(request);
      return { status: "committed" as const };
    },
    watch: (scope, listener) => {
      const key = fileTreeScopeKey(scope);
      const listeners = fileTreeWatchers.get(key) ?? new Set();
      listeners.add(listener);
      fileTreeWatchers.set(key, listeners);
      let active = true;
      queueMicrotask(() => {
        if (active) listener({ status: "ready" });
      });
      return () => {
        active = false;
        listeners.delete(listener);
        if (listeners.size === 0) fileTreeWatchers.delete(key);
      };
    },
  },
  git,
  workspaceFiles: async (projectId, worktreeId) => ({
    projectId,
    worktreeId,
    root: projects.find(({ id }) => id === projectId)?.root ?? "/workspace",
    files: [
      { resource: { projectId, worktreeId, relativePath: "README.md" }, relative: "README.md" },
    ],
  }),
  readTextFile: async () => contents,
  readBoundedFile: async (selected) => ({
    status: "text",
    text:
      selected.relativePath === resource.relativePath ? contents : `# ${selected.relativePath}\n`,
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
  saveClipboardImage: async (request) => {
    document.documentElement.dataset.savedClipboardImage = JSON.stringify({
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      mediaType: request.mediaType,
      byteLength: request.bytes.byteLength,
    });
    return { relativePath: "docs/screenshots/screenshot-fixture.png" };
  },
  fileStamp: async () => ({ ...stamp }),
};

const host = document.getElementById("zd");
if (!host) throw new Error("dev/workbench.html is missing the #zd host element");

void bootWorkbench(host, platform, async (mountHost, context) => {
  const fixture = {
    setCentreMode(mode: CentreMode) {
      const regions = context.state.snapshot().regions;
      context.state.updateRegions({
        ...regions,
        centre: { ...regions.centre, mode, split: 0.46 },
        focus: "file",
      });
    },
    createFile(relativePath: string) {
      if (fileEntries.some((entry) => entry.relativePath === relativePath)) return;
      fileEntries = [...fileEntries, file(relativePath)];
      fileTreeRevision += 1;
      publishFileTreeChange(resource);
    },
  };
  Object.assign(window, { workbenchDocumentationFixture: fixture });
  const unmount = await mountWorkbenchFeatures(mountHost, context);
  document.documentElement.dataset.workbenchReady = "true";
  return () => {
    unmount();
  };
});
