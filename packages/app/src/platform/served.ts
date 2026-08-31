import type { BoundedFileRead } from "@/editor";
import type { FileTreeAdapter, FileTreeResult } from "@/files";
import type { GitAdapter } from "@/git";
import { unavailableTerminalAdapter } from "@/terminal";
import type { WorkbenchHost } from "@/platform/composition";
import type { LaunchRequest, ProjectGrant } from "@/workbench/resources";
import type { ServedHostClient } from "./served-client";

interface SessionDescription {
  readonly protocolVersion: 1;
  readonly sessionEpoch: string;
  readonly access: "read-only";
  readonly startupProjectId: string | null;
  readonly startupWorktreeId: string | null;
  readonly startupRelativePath: string | null;
  readonly capabilities: {
    readonly projectGrants: "read-only";
    readonly fileTree: "read-only";
    readonly fileRead: "read-only";
    readonly fileWrite: "unavailable";
    readonly fileMutations: "unavailable";
    readonly fileWatch: "unavailable";
    readonly git: "unavailable";
    readonly terminal: "unavailable";
    readonly durableState: "unavailable";
    readonly projectPicker: "unavailable";
    readonly recentWorkspaces: "unavailable";
  };
}

interface GrantList {
  readonly projects: readonly ProjectGrant[];
}

const GIT_UNAVAILABLE = "Git inspection is unavailable in the read-only served workbench";

const servedGitAdapter = {
  status: async (scope) => ({
    scope,
    availability: "unavailable" as const,
    entries: [],
    truncated: false,
    problem: GIT_UNAVAILABLE,
  }),
  history: async (request) => ({
    scope: request.scope,
    availability: "unavailable" as const,
    commits: [],
    nextCursor: null,
    truncated: false,
    problem: GIT_UNAVAILABLE,
  }),
  compare: async (request) => ({
    scope: request.scope,
    availability: "unavailable" as const,
    baseCommitId: request.baseCommitId,
    headCommitId: request.headCommitId,
    entries: [],
    truncated: false,
    problem: GIT_UNAVAILABLE,
  }),
  diff: async (request) => {
    const buffer = (revision: string) => ({
      status: "unavailable" as const,
      identity: `unavailable:${request.source.changeId}:${revision}`,
      path: "",
      revision,
      problem: GIT_UNAVAILABLE,
    });
    return {
      scope: request.scope,
      availability: "unavailable" as const,
      base: buffer("base"),
      head: buffer("head"),
      problem: GIT_UNAVAILABLE,
    };
  },
} satisfies GitAdapter;

function unavailable(capability: string): Promise<never> {
  return Promise.reject(
    new Error(`${capability} is unavailable in the read-only served workbench`),
  );
}

function assertReadOnly(description: SessionDescription): void {
  const capabilities = description.capabilities;
  if (
    description.protocolVersion !== 1 ||
    description.access !== "read-only" ||
    capabilities.projectGrants !== "read-only" ||
    capabilities.fileTree !== "read-only" ||
    capabilities.fileRead !== "read-only" ||
    Object.entries(capabilities).some(
      ([name, access]) =>
        !["projectGrants", "fileTree", "fileRead"].includes(name) && access !== "unavailable",
    )
  ) {
    throw new Error("the served host did not provide the packet-zero read-only capabilities");
  }
}

function forceReadOnly(read: BoundedFileRead): BoundedFileRead {
  return read.status === "text"
    ? {
        ...read,
        writable: false,
        reason: "Served workbenches are read-only",
      }
    : read;
}

export function createServedWorkbenchHost(client: ServedHostClient): WorkbenchHost {
  const grants = () => client.request<GrantList>("projectGrants.list", {});
  let launch: Promise<LaunchRequest> | null = null;
  const launchRequest = () => {
    launch ??= Promise.all([
      client.request<SessionDescription>("session.describe", {}),
      grants(),
    ]).then(([description, listed]) => {
      assertReadOnly(description);
      const project = listed.projects.find(({ id }) => id === description.startupProjectId) ?? null;
      return {
        project,
        worktreeId: description.startupWorktreeId,
        relativePath: description.startupRelativePath,
        problem: project ? null : "The served startup project is unavailable",
      };
    });
    return launch;
  };
  const fileTree: FileTreeAdapter = {
    snapshot: (request) => client.request<FileTreeResult>("fileTree.snapshot", request),
    watch: (_scope, listener) => {
      let active = true;
      queueMicrotask(() => {
        if (active) {
          listener({
            status: "unavailable",
            problem: "Automatic file-tree updates are unavailable in this served workbench.",
          });
        }
      });
      return () => {
        active = false;
      };
    },
    mutate: async () => ({
      status: "refused",
      reason: "File changes are unavailable in the read-only served workbench",
    }),
  };

  return {
    launchRequest,
    projectGrants: async () => (await grants()).projects,
    recentWorkspaces: () => unavailable("Recent workspaces"),
    saveWorkspace: () => unavailable("Workspace persistence"),
    openWorkspace: () => unavailable("Recent workspaces"),
    createThreadWorktree: async () => ({
      status: "refused",
      kind: "git-failed",
      reason: "Thread worktrees are unavailable in the read-only served workbench",
    }),
    removeProjectGrant: () => unavailable("Project removal"),
    themeConfigFiles: async () => [],
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
      problem: "Host diagnostics are unavailable in this served workbench",
    }),
    disableDiagnostics: async () => ({
      enabled: false,
      sessionId: null,
      backgroundSampling: false,
      problem: null,
    }),
    recordDiagnostic: async () => ({ recorded: false, problem: null }),
    revealDiagnostics: () => unavailable("Host diagnostics"),
    terminal: unavailableTerminalAdapter,
    fileTree,
    git: servedGitAdapter,
    workspaceFiles: () => unavailable("Workspace file listings"),
    readTextFile: async (resource) => {
      const read = forceReadOnly(
        await client.request<BoundedFileRead>("file.readBounded", resource),
      );
      if (read.status !== "text") throw new Error(`The served file is ${read.status}`);
      return read.text;
    },
    readBoundedFile: async (resource) =>
      forceReadOnly(await client.request<BoundedFileRead>("file.readBounded", resource)),
    readProjectImage: () => unavailable("Project image reads"),
    writeTextFile: () => unavailable("File writes"),
    saveClipboardImage: () => unavailable("Clipboard image writes"),
    fileStamp: () => unavailable("File stamps"),
  };
}
