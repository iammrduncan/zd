import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { LaunchRequest } from "@/suite/types";

/**
 * The only file in the frontend that knows what shell it is running in.
 *
 * Everything above this line is portable. If Tauri ever stops being the right
 * shell, this file is the change — see docs/path-forward.md.
 */
/**
 * Identity enough to notice someone else wrote the file. See `file_stamp` in
 * packages/tauri/src/fs.rs, which is what produces it.
 *
 * Here rather than beside the code that reconciles with it — audit finding L1. It
 * describes what a platform command returns, and the platform is the bottom
 * layer: a type owned by a mini app and named here would mean the next mini app
 * that touches files inheriting a type from `md`'s directory.
 */
export interface FileStamp {
  modified: number | null;
  length: number;
}

export interface WorkspaceFile {
  path: string;
  relative: string;
}

export interface WorkspaceListing {
  root: string;
  files: WorkspaceFile[];
}

export interface Platform {
  readonly kind: "tauri" | "browser";
  /** What the process was launched to open. */
  launchRequest(): Promise<LaunchRequest>;
  /** A native file-open request is waiting. Returns an unsubscribe. */
  onOpenRequested(handler: () => void): () => void;
  /** Accept that request after the current document says switching is safe. */
  acceptOpenRequest(): Promise<LaunchRequest | null>;
  /** Read a UTF-8 text file. */
  readTextFile(path: string): Promise<string>;
  /** Markdown files inside the launch path's scoped workspace. */
  workspaceFiles(): Promise<WorkspaceListing | null>;
  /**
   * Save a UTF-8 text file. Vision §6.3: writes are atomic, so a save that is
   * interrupted leaves the previous document intact rather than a truncated one.
   * The guarantee lives on the other side of this boundary — see fs.rs.
   */
  writeTextFile(path: string, contents: string): Promise<void>;
  /**
   * Identity enough to notice someone else wrote the file, or null if it is gone.
   *
   * Vision §6.3's "detected", and deliberately a question rather than a
   * subscription: a watcher would be a plugin, a background thread, and a stream of
   * events to debounce, none of which is needed to answer "is the file still the
   * one I read?". See fs.rs.
   */
  fileStamp(path: string): Promise<FileStamp | null>;
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
  acceptOpenRequest: () => invoke<LaunchRequest | null>("accept_open_request"),
  workspaceFiles: () => invoke<WorkspaceListing | null>("workspace_files"),
  readTextFile: (path) => invoke<string>("read_text_file", { path }),
  writeTextFile: (path, contents) => invoke<void>("write_text_file", { path, contents }),
  fileStamp: (path) => invoke<FileStamp | null>("file_stamp", { path }),
  onCloseRequested: (handler) => {
    /*
     * Listen at the native window boundary. Cmd+W, the title-bar close button,
     * and the Window menu all arrive here as the same request. The earlier custom
     * Rust event put a second relay in that path, and the unit harness only proved
     * the relay's far side rather than the macOS gesture that enters it.
     *
     * Prevent first, then ask the document. The document explicitly calls
     * `closeWindow` when it is clean or the reader confirms a second time.
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
  launchRequest: async () => ({ miniapp: "md", path: null }),
  onOpenRequested: () => () => {},
  acceptOpenRequest: async () => null,
  workspaceFiles: async () => null,
  readTextFile: async (path) => {
    throw new Error(`no filesystem in the browser shell: ${path}`);
  },
  writeTextFile: async (path) => {
    throw new Error(`no filesystem in the browser shell: ${path}`);
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
