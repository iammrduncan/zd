import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  DiagnosticStatus,
  DiagnosticWriteOutcome,
  PreparedDiagnosticRecord,
} from "@/instrumentation";
import type {
  AttentionNotificationAdapter,
  CompletionSoundResult,
  NotificationActionV1,
  NotificationPermission,
  NotificationPresentationResult,
} from "@/notifications";
import type { BoundedFileRead } from "@/editor";
import { unavailableFileTreeAdapter, type FileTreeAdapter } from "@/files";
import { createTauriGitAdapter, unavailableGitAdapter, type GitAdapter } from "@/git";
import {
  unavailableTerminalAdapter,
  type TerminalAdapter,
  type TerminalSessionHandle,
} from "@/terminal";
import {
  homeLaunch,
  type FileResource,
  type LaunchRequest,
  type ProjectGrant,
} from "@/workbench/resources";

/**
 * The only file in the frontend that knows what shell it is running in.
 *
 * Everything above this line is portable. If Tauri ever stops being the right
 * shell, this file is the change — see
 * docs/adr/suite/0002-put-native-authority-behind-platform-boundary_H.md.
 */
/**
 * Identity enough to notice someone else wrote the file. See `file_stamp` in
 * packages/tauri/src/fs.rs, which is what produces it.
 *
 * Here rather than beside the code that reconciles with it — audit finding L1. It
 * describes what a platform command returns, and the platform is the bottom
 * layer. A feature-owned type placed here would make every other file consumer
 * depend on that feature's source directory.
 */
export interface FileStamp {
  modified: number | null;
  length: number;
}

export interface WorkspaceFile {
  resource: FileResource;
  relative: string;
}

export interface WorkspaceListing {
  projectId: string;
  worktreeId: string;
  root: string;
  files: WorkspaceFile[];
}

/** One bounded, non-executable theme file discovered by the native shell. */
export interface ThemeConfigFile {
  readonly fileName: string;
  readonly contents: string | null;
  readonly problem: string | null;
}

export type WindowPresentation = "ordinary" | "quick-access";

export interface GlobalShortcutRegistration {
  readonly supported: boolean;
  readonly registered: boolean;
  readonly shortcut: string;
  readonly problem: string | null;
}

export interface CreateThreadWorktreeRequest {
  readonly projectId: string;
  readonly name: string;
  readonly branch: string;
  readonly baseRevision: string | null;
}

export type WorktreeRefusalKind =
  | "unknown-project"
  | "not-repository"
  | "invalid-name"
  | "invalid-revision"
  | "collision"
  | "locked"
  | "git-failed";

export type CreateThreadWorktreeResult =
  | { readonly status: "created"; readonly worktree: ProjectGrant["worktrees"][number] }
  | {
      readonly status: "refused";
      readonly kind: WorktreeRefusalKind;
      readonly reason: string;
    };

export function unavailableThreadWorktree(): Promise<CreateThreadWorktreeResult> {
  return Promise.resolve({
    status: "refused",
    kind: "git-failed",
    reason: "thread worktree creation requires the desktop shell",
  });
}

export interface Platform {
  readonly kind: "tauri" | "browser";
  /** What the process was launched to open. */
  launchRequest(): Promise<LaunchRequest>;
  /** A native file-open request is waiting. Returns an unsubscribe. */
  onOpenRequested(handler: () => void): () => void;
  /** Inspect the oldest native request without changing active native context. */
  pendingOpenRequest(): Promise<LaunchRequest | null>;
  /** Accept that inspected request after the root transition guards approve it. */
  acceptOpenRequest(): Promise<LaunchRequest | null>;
  /** All roots approved by native launch/open/picker/worktree flows. */
  projectGrants(): Promise<readonly ProjectGrant[]>;
  /** Open the native folder picker and mint or reuse one canonical project grant. */
  chooseProject(): Promise<ProjectGrant | null>;
  /** Locate an unavailable project through the native picker without changing its identity. */
  recoverProjectGrant(projectId: string): Promise<ProjectGrant | null>;
  /** Create and approve one native-derived Git worktree for a thread. */
  createThreadWorktree(request: CreateThreadWorktreeRequest): Promise<CreateThreadWorktreeResult>;
  /** Revoke an inactive project after root lifecycle guards approve it. */
  removeProjectGrant(projectId: string): Promise<ProjectGrant>;
  /** Read direct `<name>.theme.config` children of the platform `zd` config directory. */
  themeConfigFiles(): Promise<readonly ThemeConfigFile[]>;
  /** Register the one native summon chord, returning a conflict instead of failing launch. */
  registerGlobalSummon(): Promise<GlobalShortcutRegistration>;
  /** Mirror native show, hide, repeated summon, and focus-loss changes into root state. */
  onWindowPresentationChanged(handler: (presentation: WindowPresentation) => void): () => void;
  /** Toggle the existing root window between hidden and quick-access presentation. */
  toggleQuickAccess(): Promise<WindowPresentation>;
  /** Hide quick access without closing or tearing down the root window. */
  hideQuickAccess(): Promise<WindowPresentation>;
  /** Restore the one ordinary workbench window for an explicit notification action. */
  showWorkbench(): Promise<WindowPresentation>;
  /** Read native application-window focus for foreground attention policy. */
  isWindowFocused(): Promise<boolean>;
  /** Observe native application-window focus without polling. */
  onWindowFocusChanged(handler: (focused: boolean) => void): () => void;
  /** Privacy-closed desktop notification and completion-sound presentation. */
  readonly notifications: AttentionNotificationAdapter;
  /** Inspect the local, opt-in diagnostic session without enabling it. */
  diagnosticsStatus(): Promise<DiagnosticStatus>;
  /** Start one bounded local diagnostic session. */
  enableDiagnostics(): Promise<DiagnosticStatus>;
  /** Flush and stop the current local diagnostic session. */
  disableDiagnostics(): Promise<DiagnosticStatus>;
  /** Write one already-validated closed-schema diagnostic record. */
  recordDiagnostic(record: PreparedDiagnosticRecord): Promise<DiagnosticWriteOutcome>;
  /** Reveal the native diagnostic directory without exposing its path to the webview. */
  revealDiagnostics(): Promise<void>;
  /** Structured, project-scoped native terminal lifecycle; never arbitrary process execution. */
  readonly terminal: TerminalAdapter;
  /** Complete bounded snapshots for one native-approved project/worktree. */
  readonly fileTree: FileTreeAdapter;
  /** Read-only status, bounded history, and comparisons for an approved scope. */
  readonly git: GitAdapter;
  /** Read a UTF-8 text file. */
  readTextFile(resource: FileResource): Promise<string>;
  /** Classify and read at most one bounded text file without guessing an encoding. */
  readBoundedFile(resource: FileResource): Promise<BoundedFileRead>;
  /** Markdown files inside one already-approved project/worktree root. */
  workspaceFiles(projectId: string, worktreeId: string): Promise<WorkspaceListing>;
  /**
   * Save a UTF-8 text file. Vision §6.3: writes are atomic, so a save that is
   * interrupted leaves the previous document intact rather than a truncated one.
   * The guarantee lives on the other side of this boundary — see fs.rs.
   */
  writeTextFile(resource: FileResource, contents: string): Promise<void>;
  /**
   * Identity enough to notice someone else wrote the file, or null if it is gone.
   *
   * Vision §6.3's "detected", and deliberately a question rather than a
   * subscription: a watcher would be a plugin, a background thread, and a stream of
   * events to debounce, none of which is needed to answer "is the file still the
   * one I read?". See fs.rs.
   */
  fileStamp(resource: FileResource): Promise<FileStamp | null>;
  /**
   * The window was asked to close. Returns an unsubscribe.
   *
   * The shell refuses the close and asks instead, because only this side knows
   * whether there is unsaved work — vision §6.3's whole promise is that what you
   * wrote is still there, and a window that closes on the first ask cannot keep
   * it. Nothing happens until someone calls `closeWindow`.
   */
  onCloseRequested(handler: () => void): () => void;
  /** Close the window for real, having decided it is safe to. */
  closeWindow(): Promise<void>;
  /** Hand a genuinely external URL to the system browser. */
  openExternal(url: string): Promise<void>;
}

const unavailableNotifications: AttentionNotificationAdapter = {
  permission: async () => "unsupported",
  requestPermission: async () => "unsupported",
  show: async () => ({
    status: "unsupported",
    problem: "desktop notifications require a supported desktop shell",
  }),
  onAction: () => () => {},
  playSound: async () => ({
    status: "unsupported",
    problem: "completion sounds require a supported desktop shell",
  }),
};

/** Honest attention capabilities for typed fixtures that do not own a desktop window. */
export const unavailableAttentionPlatform = {
  showWorkbench: async () => "ordinary" as const,
  isWindowFocused: async () => false,
  onWindowFocusChanged: () => () => {},
  notifications: unavailableNotifications,
} satisfies Pick<
  Platform,
  "showWorkbench" | "isWindowFocused" | "onWindowFocusChanged" | "notifications"
>;

const tauri: Platform = {
  kind: "tauri",
  launchRequest: () => invoke<LaunchRequest>("launch_request"),
  onOpenRequested: (handler) => {
    let active = true;
    const pending = listen("open-requested", () => {
      if (active) handler();
    }).then(async (unlisten) => {
      // The native event can arrive before WebKit installs this listener. Its
      // request remains queued, so ask once after listening and replay it here.
      const waiting = await invoke<boolean>("has_pending_open_request");
      if (active && waiting) handler();
      return unlisten;
    });
    return () => {
      active = false;
      void pending.then((unlisten) => unlisten());
    };
  },
  pendingOpenRequest: () => invoke<LaunchRequest | null>("pending_open_request"),
  acceptOpenRequest: () => invoke<LaunchRequest | null>("accept_open_request"),
  projectGrants: () => invoke<readonly ProjectGrant[]>("project_grants"),
  chooseProject: () => invoke<ProjectGrant | null>("choose_project"),
  recoverProjectGrant: (projectId) =>
    invoke<ProjectGrant | null>("recover_project_grant", { projectId }),
  createThreadWorktree: (request) => invoke("create_thread_worktree", { request }),
  removeProjectGrant: (projectId) => invoke<ProjectGrant>("remove_project_grant", { projectId }),
  themeConfigFiles: () => invoke<readonly ThemeConfigFile[]>("theme_config_files"),
  registerGlobalSummon: () => invoke<GlobalShortcutRegistration>("register_global_summon"),
  onWindowPresentationChanged: (handler) => {
    let active = true;
    const pending = listen<WindowPresentation>("window-presentation-changed", (event) => {
      if (active) handler(event.payload);
    });
    return () => {
      active = false;
      void pending.then((unlisten) => unlisten());
    };
  },
  toggleQuickAccess: () => invoke<WindowPresentation>("toggle_quick_access"),
  hideQuickAccess: () => invoke<WindowPresentation>("hide_quick_access"),
  showWorkbench: () => invoke<WindowPresentation>("show_workbench"),
  isWindowFocused: () => getCurrentWindow().isFocused(),
  onWindowFocusChanged: (handler) => {
    let active = true;
    const pending = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (active) handler(payload);
    });
    return () => {
      active = false;
      void pending.then((unlisten) => unlisten());
    };
  },
  notifications: {
    permission: () => invoke<NotificationPermission>("notification_permission"),
    requestPermission: () => invoke<NotificationPermission>("notification_request_permission"),
    show: (request) =>
      invoke<NotificationPresentationResult>("show_thread_notification", { request }),
    onAction: (handler) => {
      let active = true;
      const pending = listen<NotificationActionV1>("notification-action", (event) => {
        if (active) handler(event.payload);
      }).then(async (unlisten) => {
        const waiting = await invoke<readonly NotificationActionV1[]>(
          "pending_notification_actions",
        );
        if (active) waiting.forEach((action) => handler(action));
        return unlisten;
      });
      return () => {
        active = false;
        void pending.then((unlisten) => unlisten());
      };
    },
    playSound: (request) => invoke<CompletionSoundResult>("play_completion_sound", { request }),
  },
  diagnosticsStatus: () => invoke<DiagnosticStatus>("diagnostics_status"),
  enableDiagnostics: () => invoke<DiagnosticStatus>("enable_diagnostics"),
  disableDiagnostics: () => invoke<DiagnosticStatus>("disable_diagnostics"),
  recordDiagnostic: (record) => invoke<DiagnosticWriteOutcome>("record_diagnostic", { record }),
  revealDiagnostics: () => invoke<void>("reveal_diagnostics"),
  terminal: {
    start: (request) => invoke("terminal_start", { request }),
    onOutputReady: (handler) => {
      let active = true;
      const pending = listen<TerminalSessionHandle>("terminal-output-ready", (event) => {
        if (active) handler(event.payload);
      });
      return () => {
        active = false;
        void pending.then((unlisten) => unlisten());
      };
    },
    write: (session, bytes) => invoke<void>("terminal_write", { session, bytes }),
    resize: (session, viewport) => invoke<void>("terminal_resize", { session, viewport }),
    read: (session) => invoke("terminal_read", { session }),
    pollExit: (session) => invoke("terminal_poll_exit", { session }),
    terminate: (session) => invoke("terminal_terminate", { session }),
    dispose: (session) => invoke<void>("terminal_dispose", { session }),
  },
  fileTree: {
    snapshot: (request) => invoke("file_tree_snapshot", { request }),
  },
  git: createTauriGitAdapter((command, payload) => invoke(command, payload)),
  workspaceFiles: (projectId, worktreeId) =>
    invoke<WorkspaceListing>("workspace_files", { projectId, worktreeId }),
  readTextFile: (resource) => invoke<string>("read_text_file", { resource }),
  readBoundedFile: (resource) => invoke<BoundedFileRead>("read_bounded_file", { resource }),
  writeTextFile: (resource, contents) => invoke<void>("write_text_file", { resource, contents }),
  fileStamp: (resource) => invoke<FileStamp | null>("file_stamp", { resource }),
  onCloseRequested: (handler) => {
    /*
     * Listen at the native window boundary. Cmd+W, the title-bar close button,
     * and the Window menu all arrive here as the same request. The earlier custom
     * Rust event put a second relay in that path, and the unit harness only proved
     * the relay's far side rather than the macOS gesture that enters it.
     *
     * Prevent first, then ask the document. The document explicitly calls
     * `closeWindow` when it is clean or the user confirms a second time.
     */
    const pending = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      handler();
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  },
  closeWindow: () => invoke<void>("close_window"),
  openExternal: (url) => invoke<void>("open_external", { url }),
};

/**
 * Used by `npm run dev` in a plain browser and by Playwright. It is not a mock
 * of the Tauri backend — it is the honest answer for "there is no desktop shell
 * here", so tests that need real files must go through the Tauri build.
 */
const browser: Platform = {
  kind: "browser",
  launchRequest: async () => homeLaunch(),
  onOpenRequested: () => () => {},
  pendingOpenRequest: async () => null,
  acceptOpenRequest: async () => null,
  projectGrants: async () => [],
  chooseProject: async () => null,
  recoverProjectGrant: async () => null,
  createThreadWorktree: unavailableThreadWorktree,
  removeProjectGrant: async (projectId) => {
    throw new Error(`no project grants in the browser shell: ${projectId}`);
  },
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
  showWorkbench: async () => "ordinary",
  isWindowFocused: async () => document.hasFocus(),
  onWindowFocusChanged: (handler) => {
    const focused = () => handler(true);
    const blurred = () => handler(false);
    window.addEventListener("focus", focused);
    window.addEventListener("blur", blurred);
    return () => {
      window.removeEventListener("focus", focused);
      window.removeEventListener("blur", blurred);
    };
  },
  notifications: unavailableNotifications,
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
    problem: "local diagnostics require the desktop shell",
  }),
  disableDiagnostics: async () => ({
    enabled: false,
    sessionId: null,
    backgroundSampling: false,
    problem: null,
  }),
  recordDiagnostic: async () => ({ recorded: false, problem: null }),
  revealDiagnostics: async () => {
    throw new Error("local diagnostics require the desktop shell");
  },
  terminal: unavailableTerminalAdapter,
  fileTree: unavailableFileTreeAdapter,
  git: unavailableGitAdapter,
  workspaceFiles: async (projectId, worktreeId) => {
    throw new Error(`no filesystem in the browser shell: ${projectId}/${worktreeId}`);
  },
  readTextFile: async (resource) => {
    throw new Error(`no filesystem in the browser shell: ${resource.relativePath}`);
  },
  readBoundedFile: async () => ({
    status: "unavailable",
    problem: "bounded file reads require the desktop shell",
  }),
  writeTextFile: async (resource) => {
    throw new Error(`no filesystem in the browser shell: ${resource.relativePath}`);
  },
  // Null rather than a throw: "there is no file here" is the honest answer in a
  // browser, and it makes the reconcile path a no-op instead of an error to catch.
  fileStamp: async () => null,
  /*
   * A browser tab is not this app's window to close, and `beforeunload` is the
   * platform's own affair rather than something to reimplement. So nothing ever
   * asks, and `closeWindow` is a no-op — the honest answer for "there is no
   * desktop shell here", same as every other method on this object.
   */
  onCloseRequested: () => () => {},
  closeWindow: async () => {},
  openExternal: async (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

export function detectPlatform(): Platform {
  return "__TAURI_INTERNALS__" in window ? tauri : browser;
}
