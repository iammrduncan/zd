import type { BoundedFileRead } from "@/editor";
import type { FileTreeAdapter, FileTreeResult } from "@/files";
import type { GitAdapter } from "@/git";
import type {
  ClipboardImageMediaType,
  FileStamp,
  ProjectImage,
  ThemeConfigFile,
  WorkspaceListing,
} from "@/platform";
import type { WorkbenchHost } from "@/platform/composition";
import { createDurableStateAdapter } from "@/platform/durable-state";
import type { ServedHostClient } from "@/platform/served-client";
import { unavailableTerminalAdapter } from "@/terminal";
import type { FileResource, LaunchRequest, ProjectGrant } from "@/workbench/resources";

const EDITABLE_TEXT_BYTES = 8 * 1024 * 1024;
const PROJECT_IMAGE_BYTES = 16 * 1024 * 1024;
const BASE64_CHUNK_BYTES = 32 * 1024;

interface SessionDescription {
  readonly protocolVersion: 1;
  readonly sessionEpoch: string;
  readonly access: "read-write";
  readonly startupProjectId: string | null;
  readonly startupWorktreeId: string | null;
  readonly startupRelativePath: string | null;
  readonly capabilities: {
    readonly projectGrants: "read-only";
    readonly fileTree: "read-only";
    readonly fileRead: "read-only";
    readonly fileWrite: "read-write";
    readonly fileMutations: "read-write";
    readonly clipboardImages: "read-write";
    readonly projectImages: "read-only";
    readonly fileWatch: "unavailable";
    readonly git: "read-only";
    readonly worktrees: "read-write";
    readonly terminal: "unavailable";
    readonly durableState: "read-write";
    readonly themeFiles: "read-only";
    readonly hostDiagnostics: "read-write";
    readonly projectPicker: "unavailable";
    readonly recentWorkspaces: "unavailable";
  };
}

interface GrantList {
  readonly projects: readonly ProjectGrant[];
}

interface ServedTextRead {
  readonly status: "text";
  readonly textBase64: string;
  readonly byteLength: number;
  readonly writable: boolean;
  readonly reason: string | null;
}

type ServedBoundedFileRead = Exclude<BoundedFileRead, { readonly status: "text" }> | ServedTextRead;

interface ServedProjectImage {
  readonly mediaType: ClipboardImageMediaType;
  readonly bytesBase64: string;
}

const EXPECTED_CAPABILITIES: SessionDescription["capabilities"] = {
  projectGrants: "read-only",
  fileTree: "read-only",
  fileRead: "read-only",
  fileWrite: "read-write",
  fileMutations: "read-write",
  clipboardImages: "read-write",
  projectImages: "read-only",
  fileWatch: "unavailable",
  git: "read-only",
  worktrees: "read-write",
  terminal: "unavailable",
  durableState: "read-write",
  themeFiles: "read-only",
  hostDiagnostics: "read-write",
  projectPicker: "unavailable",
  recentWorkspaces: "unavailable",
};

function unavailable(capability: string): Promise<never> {
  return Promise.reject(new Error(`${capability} is unavailable in this served workbench`));
}

function assertEditingCapabilities(description: SessionDescription): void {
  const actual = description.capabilities as Readonly<Record<string, string>>;
  const expected = EXPECTED_CAPABILITIES as Readonly<Record<string, string>>;
  if (
    description.protocolVersion !== 1 ||
    description.access !== "read-write" ||
    Object.keys(actual).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([name, access]) => actual[name] !== access)
  ) {
    throw new Error("the served host did not provide the editing capability contract");
  }
}

function maximumBase64Length(decodedBytes: number): number {
  return Math.ceil(decodedBytes / 3) * 4;
}

function decodeBase64(encoded: string, decodedLimit: number): Uint8Array {
  if (encoded.length > maximumBase64Length(decodedLimit)) {
    throw new Error("the served payload exceeds its decoded byte limit");
  }
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("the served payload is not valid base64");
  }
  if (binary.length > decodedLimit) {
    throw new Error("the served payload exceeds its decoded byte limit");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array, decodedLimit: number): string {
  if (bytes.byteLength > decodedLimit) {
    throw new Error("the host payload exceeds its decoded byte limit");
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

function decodeFileRead(read: ServedBoundedFileRead): BoundedFileRead {
  if (read.status !== "text") return read;
  const bytes = decodeBase64(read.textBase64, EDITABLE_TEXT_BYTES);
  if (bytes.byteLength !== read.byteLength) {
    throw new Error("the served text byte length is inconsistent");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("the served text is not valid UTF-8");
  }
  return {
    status: "text",
    text,
    byteLength: read.byteLength,
    writable: read.writable,
    ...(read.reason === null ? {} : { reason: read.reason }),
  };
}

export function createServedWorkbenchHost(client: ServedHostClient): WorkbenchHost {
  const grants = () => client.request<GrantList>("projectGrants.list", {});
  const durableState = createDurableStateAdapter({
    describe: () => client.request("state.describe", {}),
    apply: (request) => client.request("state.apply", request),
  });
  const readBoundedFile = async (resource: FileResource): Promise<BoundedFileRead> =>
    decodeFileRead(await client.request<ServedBoundedFileRead>("file.readBounded", resource));
  let launch: Promise<LaunchRequest> | null = null;
  const launchRequest = () => {
    launch ??= Promise.all([
      client.request<SessionDescription>("session.describe", {}),
      grants(),
    ]).then(([description, listed]) => {
      assertEditingCapabilities(description);
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
    mutate: (request) => client.request("fileTree.mutate", request),
  };
  const git: GitAdapter = {
    status: (scope) => client.request("git.status", scope),
    history: (request) => client.request("git.history", request),
    compare: (request) => client.request("git.compare", request),
    diff: (request) => client.request("git.diff", request),
  };

  return {
    usesHostDurableState: true,
    launchRequest,
    durableState,
    projectGrants: async () => (await grants()).projects,
    recentWorkspaces: () => unavailable("Recent workspaces"),
    saveWorkspace: () => unavailable("Workspace persistence"),
    openWorkspace: () => unavailable("Recent workspaces"),
    createThreadWorktree: (request) => client.request("worktree.create", request),
    removeProjectGrant: () => unavailable("Project removal"),
    themeConfigFiles: () => client.request<readonly ThemeConfigFile[]>("theme.list", {}),
    diagnosticsStatus: () => client.request("diagnostics.status", {}),
    enableDiagnostics: () => client.request("diagnostics.enable", {}),
    disableDiagnostics: () => client.request("diagnostics.disable", {}),
    recordDiagnostic: (record) => client.request("diagnostics.record", record),
    revealDiagnostics: () => unavailable("Revealing remote diagnostics"),
    terminal: unavailableTerminalAdapter,
    fileTree,
    git,
    workspaceFiles: (projectId, worktreeId) =>
      client.request<WorkspaceListing>("workspaceFiles.list", { projectId, worktreeId }),
    readTextFile: async (resource) => {
      const read = await readBoundedFile(resource);
      if (read.status !== "text") throw new Error(`The served file is ${read.status}`);
      return read.text;
    },
    readBoundedFile,
    readProjectImage: async (resource): Promise<ProjectImage> => {
      const image = await client.request<ServedProjectImage>("image.readProject", resource);
      const bytes = decodeBase64(image.bytesBase64, PROJECT_IMAGE_BYTES);
      return { mediaType: image.mediaType, bytes: Array.from(bytes) };
    },
    writeTextFile: async (resource, contents) => {
      const bytes = new TextEncoder().encode(contents);
      const contentsBase64 = encodeBase64(bytes, EDITABLE_TEXT_BYTES);
      await client.request<null>("file.writeText", { ...resource, contentsBase64 });
    },
    saveClipboardImage: async (request) => {
      if (request.bytes.byteLength === 0) throw new Error("the clipboard image is empty");
      return client.request("image.saveClipboard", {
        projectId: request.projectId,
        worktreeId: request.worktreeId,
        mediaType: request.mediaType,
        bytesBase64: encodeBase64(request.bytes, PROJECT_IMAGE_BYTES),
      });
    },
    fileStamp: (resource) => client.request<FileStamp | null>("file.stamp", resource),
  };
}
