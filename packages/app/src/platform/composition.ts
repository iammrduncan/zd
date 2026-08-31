import type { Platform } from "@/platform";

/** Operating-system authority shared by browser and desktop clients. */
export type WorkbenchHost = Pick<
  Platform,
  | "usesHostDurableState"
  | "launchRequest"
  | "durableState"
  | "projectGrants"
  | "recentWorkspaces"
  | "saveWorkspace"
  | "openWorkspace"
  | "createThreadWorktree"
  | "removeProjectGrant"
  | "themeConfigFiles"
  | "diagnosticsStatus"
  | "enableDiagnostics"
  | "disableDiagnostics"
  | "recordDiagnostic"
  | "revealDiagnostics"
  | "terminal"
  | "fileTree"
  | "git"
  | "readTextFile"
  | "readBoundedFile"
  | "readProjectImage"
  | "workspaceFiles"
  | "writeTextFile"
  | "saveClipboardImage"
  | "fileStamp"
>;

/** Viewing-computer behavior that never owns project or process authority. */
export type ClientShell = Omit<Platform, keyof WorkbenchHost | "kind">;

export function composePlatform(
  kind: Platform["kind"],
  host: WorkbenchHost,
  shell: ClientShell,
): Platform {
  return { kind, ...host, ...shell };
}
