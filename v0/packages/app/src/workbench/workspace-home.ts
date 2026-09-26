import "./workspace-home.css";

import type { Platform } from "@/platform";
import type { ProjectGrant, RecentWorkspace } from "./resources";
import type { TransitionResult, WorkbenchStateOwner } from "./state";
import type { Unmount } from "./runtime";

type WorkspacePersistencePlatform = Pick<Platform, "saveWorkspace">;
type WorkspaceHomePlatform = Pick<Platform, "chooseProject" | "recentWorkspaces" | "openWorkspace">;

function reasonFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function launchFor(grants: readonly ProjectGrant[]) {
  const project = grants[0];
  const worktreeId = project?.worktrees[0]?.id;
  if (!project || !worktreeId) return null;
  return {
    project,
    worktreeId,
    relativePath: null,
    problem: null,
  };
}

function refusedProblem(result: TransitionResult): string | null {
  return result.status === "refused" ? result.reason : null;
}

/** Persist each distinct ordered project set through the native root authority. */
export function attachWorkspacePersistence(
  owner: WorkbenchStateOwner,
  platform: WorkspacePersistencePlatform,
): Unmount {
  let active = true;
  let lastObserved = "";
  let tail = Promise.resolve();

  const observe = () => {
    const projectIds = owner.snapshot().projects.map(({ id }) => id);
    if (projectIds.length === 0) {
      lastObserved = "";
      return;
    }
    const identity = JSON.stringify(projectIds);
    if (identity === lastObserved) return;
    lastObserved = identity;
    tail = tail
      .then(async () => {
        await platform.saveWorkspace(projectIds);
      })
      .catch(() => {
        // Persistence is supplementary to the live native grants. A later project
        // change retries with the newest complete setup.
      });
  };

  observe();
  const unsubscribe = owner.subscribe(observe);
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
  };
}

function recentRow(workspace: RecentWorkspace, open: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zd-workspace-home-recent-row";
  button.dataset.recentWorkspace = workspace.id;
  const identity = document.createElement("span");
  identity.className = "zd-workspace-home-recent-name";
  identity.textContent = workspace.name;
  const kind = document.createElement("span");
  kind.className = "zd-workspace-home-recent-kind";
  kind.textContent = workspace.kind === "workspace" ? "Workspace" : "Project";
  button.append(identity, kind);
  button.setAttribute(
    "aria-label",
    `Open ${workspace.kind} ${workspace.name}. ${workspace.projectNames.join(", ")}`,
  );
  button.addEventListener("click", open);
  return button;
}

/** Mount the central selection surface shown only for a bare `zd` launch. */
export function mountWorkspaceHome(
  host: HTMLElement,
  owner: WorkbenchStateOwner,
  platform: WorkspaceHomePlatform,
): Unmount {
  const root = document.createElement("section");
  root.className = "zd-workspace-home";
  root.setAttribute("aria-labelledby", "zd-workspace-home-title");
  const title = document.createElement("h1");
  title.id = "zd-workspace-home-title";
  title.textContent = "Open a project";
  const introduction = document.createElement("p");
  introduction.textContent = "Choose a folder or return to a recent project workspace.";
  const openFolder = document.createElement("button");
  openFolder.type = "button";
  openFolder.className = "zd-workspace-home-open";
  openFolder.dataset.openProject = "true";
  openFolder.textContent = "Open Folder…";
  const recentHeading = document.createElement("h2");
  recentHeading.textContent = "Recent";
  const recent = document.createElement("div");
  recent.className = "zd-workspace-home-recent";
  recent.setAttribute("role", "list");
  const status = document.createElement("p");
  status.className = "zd-workspace-home-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(title, introduction, openFolder, recentHeading, recent, status);
  host.replaceChildren(root);

  let active = true;
  let busy = false;
  const setBusy = (next: boolean) => {
    busy = next;
    openFolder.disabled = next;
    recent.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = next;
    });
  };
  const perform = async (operation: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    status.textContent = "";
    try {
      const problem = await operation();
      if (active && problem) status.textContent = problem;
    } catch (cause) {
      if (active) status.textContent = reasonFor(cause);
    } finally {
      if (active) setBusy(false);
    }
  };

  openFolder.addEventListener("click", () => {
    void perform(async () => {
      const grant = await platform.chooseProject();
      if (!grant) return null;
      return refusedProblem(await owner.acceptProjectGrant(grant));
    });
  });

  void platform
    .recentWorkspaces()
    .then((workspaces) => {
      if (!active) return;
      recent.replaceChildren();
      if (workspaces.length === 0) {
        const empty = document.createElement("p");
        empty.className = "zd-workspace-home-empty";
        empty.textContent = "No recent projects yet.";
        recent.append(empty);
        return;
      }
      for (const workspace of workspaces) {
        const row = recentRow(workspace, () => {
          void perform(async () => {
            const grants = await platform.openWorkspace(workspace.id);
            const launch = launchFor(grants);
            if (!launch) return "That workspace has no available project folder.";
            return refusedProblem(await owner.applyLaunch(launch, grants));
          });
        });
        row.setAttribute("role", "listitem");
        recent.append(row);
      }
    })
    .catch((cause: unknown) => {
      if (active) status.textContent = reasonFor(cause);
    });

  return () => {
    active = false;
    root.remove();
  };
}
