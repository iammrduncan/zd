import type { BoundedFileRead } from "@/editor";
import type { FileTreeAdapter, FileTreeResult, FileTreeWatchEvent } from "@/files";
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
import type {
  ServedHostClient,
  ServedHostEvent,
  ServedSessionSnapshot,
} from "@/platform/served-client";
import {
  terminalSessionKey,
  type TerminalAdapter,
  type TerminalExitStatus,
  type TerminalOutputBatch,
  type TerminalSessionHandle,
} from "@/terminal";
import type { FileResource, LaunchRequest, ProjectGrant } from "@/workbench/resources";

const EDITABLE_TEXT_BYTES = 8 * 1024 * 1024;
const PROJECT_IMAGE_BYTES = 16 * 1024 * 1024;
const TERMINAL_INPUT_BYTES = 64 * 1024;
const TERMINAL_OUTPUT_BYTES = 16 * 1024 * 1024;
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
    readonly fileWatch: "read-only";
    readonly git: "read-only";
    readonly worktrees: "read-write";
    readonly terminal: "read-write";
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

interface ServedTerminalOutput {
  readonly session: TerminalSessionHandle;
  readonly offset: number;
  readonly droppedBefore: number;
  readonly bytesBase64: string;
  readonly readError: string | null;
}

interface ServedTerminalSnapshot {
  readonly session: TerminalSessionHandle;
  readonly retainedFrom: number;
  readonly nextOffset: number;
  readonly availability: "running" | "exited" | "unavailable";
  readonly exit: TerminalExitStatus | null;
}

const EXPECTED_CAPABILITIES: SessionDescription["capabilities"] = {
  projectGrants: "read-only",
  fileTree: "read-only",
  fileRead: "read-only",
  fileWrite: "read-write",
  fileMutations: "read-write",
  clipboardImages: "read-write",
  projectImages: "read-only",
  fileWatch: "read-only",
  git: "read-only",
  worktrees: "read-write",
  terminal: "read-write",
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

function recordObject(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function terminalHandle(value: unknown): TerminalSessionHandle | null {
  const session = recordObject(value);
  if (
    !session ||
    typeof session.sessionId !== "string" ||
    session.sessionId.length === 0 ||
    typeof session.projectId !== "string" ||
    session.projectId.length === 0 ||
    typeof session.worktreeId !== "string" ||
    session.worktreeId.length === 0
  ) {
    return null;
  }
  return {
    sessionId: session.sessionId,
    projectId: session.projectId,
    worktreeId: session.worktreeId,
  };
}

function terminalExitStatus(value: unknown): TerminalExitStatus | null {
  const exit = recordObject(value);
  if (
    !exit ||
    !["exited", "terminated", "disposed"].includes(String(exit.reason)) ||
    (exit.code !== null &&
      (!Number.isSafeInteger(exit.code) ||
        Number(exit.code) < 0 ||
        Number(exit.code) > 0xffff_ffff)) ||
    (exit.signal !== null && (typeof exit.signal !== "string" || exit.signal.length === 0))
  ) {
    return null;
  }
  return {
    reason: exit.reason as TerminalExitStatus["reason"],
    code: exit.code === null ? null : Number(exit.code),
    signal: exit.signal === null ? null : String(exit.signal),
  };
}

function terminalSnapshot(value: unknown): ServedTerminalSnapshot | null {
  const snapshot = recordObject(value);
  const session = terminalHandle(snapshot?.session);
  const exit = snapshot?.exit === null ? null : terminalExitStatus(snapshot?.exit);
  if (
    !snapshot ||
    !session ||
    !Number.isSafeInteger(snapshot.retainedFrom) ||
    Number(snapshot.retainedFrom) < 0 ||
    !Number.isSafeInteger(snapshot.nextOffset) ||
    Number(snapshot.nextOffset) < Number(snapshot.retainedFrom) ||
    !["running", "exited", "unavailable"].includes(String(snapshot.availability)) ||
    (snapshot.exit !== null && !exit) ||
    (snapshot.availability === "running" && exit !== null) ||
    (snapshot.availability === "exited" && exit === null)
  ) {
    return null;
  }
  return {
    session,
    retainedFrom: Number(snapshot.retainedFrom),
    nextOffset: Number(snapshot.nextOffset),
    availability: snapshot.availability as ServedTerminalSnapshot["availability"],
    exit,
  };
}

function terminalOutput(
  value: unknown,
  expected: TerminalSessionHandle,
): ServedTerminalOutput | null {
  const output = recordObject(value);
  const session = terminalHandle(output?.session);
  if (
    !output ||
    !session ||
    terminalSessionKey(session) !== terminalSessionKey(expected) ||
    !Number.isSafeInteger(output.offset) ||
    Number(output.offset) < 0 ||
    !Number.isSafeInteger(output.droppedBefore) ||
    Number(output.droppedBefore) < 0 ||
    typeof output.bytesBase64 !== "string" ||
    (output.readError !== null && typeof output.readError !== "string")
  ) {
    return null;
  }
  return {
    session,
    offset: Number(output.offset),
    droppedBefore: Number(output.droppedBefore),
    bytesBase64: output.bytesBase64,
    readError: output.readError === null ? null : String(output.readError),
  };
}

function terminalScopeKey(projectId: string, worktreeId: string): string {
  return `${projectId}\0${worktreeId}`;
}

function watchPayload(event: ServedHostEvent): {
  readonly projectId: string;
  readonly worktreeId: string;
  readonly watchId: string;
} | null {
  const { projectId, worktreeId, watchId } = event.payload;
  return typeof projectId === "string" &&
    typeof worktreeId === "string" &&
    typeof watchId === "string"
    ? { projectId, worktreeId, watchId }
    : null;
}

function watchSnapshot(value: unknown): {
  readonly projectId: string;
  readonly worktreeId: string;
  readonly watchId: string;
} | null {
  const watch = recordObject(value);
  if (!watch) return null;
  const { projectId, worktreeId, watchId } = watch;
  return typeof projectId === "string" &&
    projectId.length > 0 &&
    typeof worktreeId === "string" &&
    worktreeId.length > 0 &&
    typeof watchId === "string" &&
    watchId.length > 0
    ? { projectId, worktreeId, watchId }
    : null;
}

export function createServedWorkbenchHost(client: ServedHostClient): WorkbenchHost {
  const grants = () => client.request<GrantList>("projectGrants.list", {});
  const durableState = createDurableStateAdapter({
    describe: () => client.request("state.describe", {}),
    apply: (request) => client.request("state.apply", request),
  });
  const readBoundedFile = async (resource: FileResource): Promise<BoundedFileRead> =>
    decodeFileRead(await client.request<ServedBoundedFileRead>("file.readBounded", resource));
  const outputListeners = new Set<(session: TerminalSessionHandle) => void>();
  const activeTerminals = new Map<string, TerminalSessionHandle>();
  const terminalRuntime = new Map<string, ServedTerminalSnapshot>();
  const reattachableTerminals = new Map<string, TerminalSessionHandle[]>();
  const watchListeners = new Map<
    string,
    {
      readonly projectId: string;
      readonly worktreeId: string;
      readonly listener: (event: FileTreeWatchEvent) => void;
    }
  >();
  let watchSequence = 0;
  let runtimeEpoch: string | null = null;

  const acceptRuntimeSnapshot = (
    snapshot: ServedSessionSnapshot,
    reconcileWatches = true,
  ): void => {
    const epochChanged = runtimeEpoch !== null && snapshot.sessionEpoch !== runtimeEpoch;
    if (epochChanged) {
      for (const [key, session] of activeTerminals) {
        const previous = terminalRuntime.get(key);
        terminalRuntime.set(key, {
          session,
          retainedFrom: previous?.nextOffset ?? 0,
          nextOffset: previous?.nextOffset ?? 0,
          availability: "unavailable",
          exit: null,
        });
        for (const listener of outputListeners) listener(session);
      }
    }
    runtimeEpoch = snapshot.sessionEpoch;
    reattachableTerminals.clear();
    const reportedTerminalKeys = new Set<string>();
    for (const value of snapshot.terminals) {
      const terminal = terminalSnapshot(value);
      if (!terminal) continue;
      const sessionKey = terminalSessionKey(terminal.session);
      const previous = terminalRuntime.get(sessionKey);
      reportedTerminalKeys.add(sessionKey);
      terminalRuntime.set(sessionKey, terminal);
      if (!activeTerminals.has(sessionKey)) {
        const key = terminalScopeKey(terminal.session.projectId, terminal.session.worktreeId);
        const sessions = reattachableTerminals.get(key) ?? [];
        sessions.push(terminal.session);
        reattachableTerminals.set(key, sessions);
      }
      if (terminal.availability !== "running" && previous?.availability !== terminal.availability) {
        for (const listener of outputListeners) listener(terminal.session);
      }
    }
    if (snapshot.resourceStatus === "lost") {
      for (const [key, session] of activeTerminals) {
        if (reportedTerminalKeys.has(key)) continue;
        const previous = terminalRuntime.get(key);
        terminalRuntime.set(key, {
          session,
          retainedFrom: previous?.nextOffset ?? 0,
          nextOffset: previous?.nextOffset ?? 0,
          availability: "unavailable",
          exit: null,
        });
        for (const listener of outputListeners) listener(session);
      }
    }
    for (const key of terminalRuntime.keys()) {
      if (!reportedTerminalKeys.has(key) && !activeTerminals.has(key)) terminalRuntime.delete(key);
    }
    if (!reconcileWatches) return;
    const remoteWatches = new Map(
      snapshot.watches
        .map(watchSnapshot)
        .filter((watch): watch is NonNullable<typeof watch> => watch !== null)
        .map((watch) => [watch.watchId, watch]),
    );
    queueMicrotask(() => {
      for (const [watchId, remote] of remoteWatches) {
        if (watchListeners.has(watchId)) continue;
        void client.request("fileTree.watch.stop", remote).catch(() => undefined);
      }
      for (const [watchId, watch] of watchListeners) {
        const remote = remoteWatches.get(watchId);
        const attached =
          snapshot.resourceStatus === "active" &&
          remote?.projectId === watch.projectId &&
          remote.worktreeId === watch.worktreeId;
        watch.listener({ status: "changed" });
        if (attached) continue;
        void client
          .request("fileTree.watch.start", {
            projectId: watch.projectId,
            worktreeId: watch.worktreeId,
            watchId,
          })
          .then(() => watch.listener({ status: "ready" }))
          .catch(() => {
            watch.listener({
              status: "unavailable",
              problem: "Automatic file-tree updates are unavailable.",
            });
          });
      }
    });
  };
  const initialRuntimeSnapshot = client
    .request<ServedSessionSnapshot>("session.snapshot", {})
    .then((snapshot) => {
      acceptRuntimeSnapshot(snapshot, false);
      return null;
    })
    .catch((cause): Error => (cause instanceof Error ? cause : new Error(String(cause))));
  client.onSnapshot(acceptRuntimeSnapshot);
  client.onEvent((event) => {
    if (event.event === "fileTree.changed" || event.event === "fileTree.unavailable") {
      const payload = watchPayload(event);
      const watch = payload ? watchListeners.get(payload.watchId) : null;
      if (
        !payload ||
        !watch ||
        watch.projectId !== payload.projectId ||
        watch.worktreeId !== payload.worktreeId
      ) {
        return;
      }
      watch.listener(
        event.event === "fileTree.changed"
          ? { status: "changed" }
          : {
              status: "unavailable",
              problem: "Automatic file-tree updates are unavailable.",
            },
      );
      return;
    }
    if (event.event === "terminal.outputReady" || event.event === "terminal.exited") {
      const session = terminalHandle(event.payload.session);
      if (session) for (const listener of outputListeners) listener(session);
    }
  });
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
    watch: (scope, listener) => {
      const watchId = `served-file-tree-watch-${++watchSequence}`;
      let active = true;
      let started = false;
      const request = { ...scope, watchId };
      watchListeners.set(watchId, { ...scope, listener });
      const pending = client
        .request<null>("fileTree.watch.start", request)
        .then(() => {
          started = true;
          if (active) listener({ status: "ready" });
        })
        .catch(() => {
          if (active) {
            listener({
              status: "unavailable",
              problem: "Automatic file-tree updates are unavailable.",
            });
          }
        });
      return () => {
        if (!active) return;
        active = false;
        watchListeners.delete(watchId);
        void pending.then(() => {
          if (started) void client.request("fileTree.watch.stop", request).catch(() => undefined);
        });
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
  const terminal: TerminalAdapter = {
    start: async (request) => {
      const snapshotProblem = await initialRuntimeSnapshot;
      if (snapshotProblem) throw snapshotProblem;
      const key = terminalScopeKey(request.projectId, request.worktreeId);
      const available = reattachableTerminals.get(key);
      const attached = available?.shift();
      if (available?.length === 0) reattachableTerminals.delete(key);
      const session = terminalHandle(
        attached ?? (await client.request<unknown>("terminal.start", request)),
      );
      if (!session) throw new Error("the served terminal returned an invalid session handle");
      if (session.projectId !== request.projectId || session.worktreeId !== request.worktreeId) {
        throw new Error("the served terminal attached a different approved scope");
      }
      const sessionKey = terminalSessionKey(session);
      activeTerminals.set(sessionKey, session);
      if (!terminalRuntime.has(sessionKey)) {
        terminalRuntime.set(sessionKey, {
          session,
          retainedFrom: 0,
          nextOffset: 0,
          availability: "running",
          exit: null,
        });
      }
      return session;
    },
    onOutputReady: (listener) => {
      outputListeners.add(listener);
      return () => outputListeners.delete(listener);
    },
    write: async (session, bytes) => {
      if (!bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
        throw new Error("the terminal input bytes are invalid");
      }
      await client.request<null>("terminal.write", {
        session,
        bytesBase64: encodeBase64(Uint8Array.from(bytes), TERMINAL_INPUT_BYTES),
      });
    },
    resize: async (session, viewport) => {
      await client.request<null>("terminal.resize", { session, viewport });
    },
    read: async (session): Promise<TerminalOutputBatch> => {
      const sessionKey = terminalSessionKey(session);
      const runtime = terminalRuntime.get(sessionKey);
      if (runtime?.availability === "unavailable") {
        return {
          session,
          offset: runtime.nextOffset,
          droppedBefore: 0,
          bytes: [],
          readError: "The remote terminal session is no longer available.",
        };
      }
      const result = terminalOutput(
        await client.request<unknown>("terminal.read", { session }),
        session,
      );
      if (!result) throw new Error("the served terminal returned invalid output");
      const bytes = decodeBase64(result.bytesBase64, TERMINAL_OUTPUT_BYTES);
      terminalRuntime.set(sessionKey, {
        session,
        retainedFrom: result.offset,
        nextOffset: result.offset + bytes.byteLength,
        availability: "running",
        exit: null,
      });
      return {
        session: result.session,
        offset: result.offset,
        droppedBefore: result.droppedBefore,
        bytes: Array.from(bytes),
        readError: result.readError,
      };
    },
    pollExit: async (session) => {
      const sessionKey = terminalSessionKey(session);
      if (terminalRuntime.get(sessionKey)?.availability === "unavailable") return null;
      const result = await client.request<unknown>("terminal.pollExit", { session });
      if (result === null) return null;
      const exit = terminalExitStatus(result);
      if (!exit) throw new Error("the served terminal returned an invalid exit status");
      const previous = terminalRuntime.get(sessionKey);
      terminalRuntime.set(sessionKey, {
        session,
        retainedFrom: previous?.retainedFrom ?? 0,
        nextOffset: previous?.nextOffset ?? 0,
        availability: "exited",
        exit,
      });
      return exit;
    },
    terminate: async (session) => {
      const exit = terminalExitStatus(
        await client.request<unknown>("terminal.terminate", { session }),
      );
      if (!exit) throw new Error("the served terminal returned an invalid exit status");
      const sessionKey = terminalSessionKey(session);
      const previous = terminalRuntime.get(sessionKey);
      terminalRuntime.set(sessionKey, {
        session,
        retainedFrom: previous?.retainedFrom ?? 0,
        nextOffset: previous?.nextOffset ?? 0,
        availability: "exited",
        exit,
      });
      return exit;
    },
    dispose: async (session) => {
      await client.request<null>("terminal.dispose", { session });
      const sessionKey = terminalSessionKey(session);
      activeTerminals.delete(sessionKey);
      terminalRuntime.delete(sessionKey);
    },
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
    terminal,
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
