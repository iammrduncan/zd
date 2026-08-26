import {
  mountTerminalThreadSurface,
  TerminalThreadSession,
  type TerminalThreadInstrumentationEvent,
  type TerminalThreadSurface,
} from "@/threads";
import type { TerminalScope, TerminalSessionHandle, TerminalViewport } from "@/terminal";
import type { Unmount, WorkbenchRuntimeContext } from "../runtime";
import { registerCommandTarget } from "../shortcuts";
import type { WorkbenchState } from "../state";

import "./styles.css";

const INITIAL_VIEWPORT: TerminalViewport = {
  rows: 24,
  columns: 80,
  pixelWidth: 0,
  pixelHeight: 0,
};

interface ProjectTerminalScope extends TerminalScope {
  readonly projectName: string;
  readonly worktreeLabel: string;
}

interface ProjectTerminalPane {
  readonly element: HTMLElement;
  readonly session: TerminalThreadSession;
  readonly started: Promise<void>;
  readonly surface: TerminalThreadSurface;
}

interface ProjectTerminalGroup {
  readonly element: HTMLElement;
  readonly panes: ProjectTerminalPane[];
  readonly projectId: string;
  readonly scope: ProjectTerminalScope;
  active: ProjectTerminalPane | null;
}

function scopeForProject(state: WorkbenchState, projectId: string): ProjectTerminalScope | null {
  const project = state.projects.find(({ id }) => id === projectId);
  if (!project || project.availability !== "available") return null;
  const worktree =
    state.worktrees.find(
      ({ projectId: owner, root, availability }) =>
        owner === projectId && root === project.root && availability === "available",
    ) ??
    state.worktrees.find(
      ({ projectId: owner, availability }) => owner === projectId && availability === "available",
    );
  if (!worktree) return null;
  return {
    projectId,
    worktreeId: worktree.id,
    projectName: project.name,
    worktreeLabel: worktree.name,
  };
}

function live(session: TerminalThreadSession): boolean {
  const status = session.snapshot().status;
  return status === "running" || status === "starting";
}

export interface ProjectTerminalOptions {
  readonly mountSurface?: typeof mountTerminalThreadSurface;
}

/** One runtime-only terminal panel per project, independent from durable thread state. */
export function mountProjectTerminal(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  options: ProjectTerminalOptions = {},
): Unmount {
  host.classList.add("zd-project-terminal");
  host.dataset.projectTerminal = "true";
  host.setAttribute("aria-label", "Project terminal");
  host.tabIndex = -1;
  host.hidden = true;

  const groups = new Map<string, ProjectTerminalGroup>();
  let disposed = false;
  let visible = false;

  const record = (event: TerminalThreadInstrumentationEvent) => {
    void context.instrumentation.record({
      recordType: "event",
      operation: event.operation,
      outcome: event.outcome,
      context: { projectId: event.projectId, worktreeId: event.worktreeId },
    });
  };

  const start = (session: TerminalThreadSession): Promise<void> =>
    session
      .start(INITIAL_VIEWPORT)
      .then(async () => {
        await session.refresh();
        await session.pollExit();
      })
      .catch(() => undefined);

  const updateGroup = (group: ProjectTerminalGroup): void => {
    group.element.style.setProperty("--project-terminal-panes", String(group.panes.length));
    for (const pane of group.panes) {
      pane.element.dataset.active = String(pane === group.active);
    }
  };

  const createPane = (group: ProjectTerminalGroup): ProjectTerminalPane => {
    const element = document.createElement("div");
    element.className = "zd-project-terminal-pane";
    element.dataset.projectTerminalPane = "true";
    const session = new TerminalThreadSession(context.platform.terminal, group.scope, {
      onInstrumentation: record,
    });
    const surface = (options.mountSurface ?? mountTerminalThreadSurface)(
      element,
      session,
      {
        threadName: "Project",
        projectName: group.scope.projectName,
        worktreeLabel: group.scope.worktreeLabel,
      },
      { kind: "project" },
    );
    const pane: ProjectTerminalPane = {
      element,
      session,
      started: start(session),
      surface,
    };
    const activate = () => {
      group.active = pane;
      updateGroup(group);
    };
    element.addEventListener("focusin", activate);
    element.addEventListener("pointerdown", activate);
    group.panes.push(pane);
    group.active = pane;
    group.element.append(element);
    updateGroup(group);
    return pane;
  };

  const ensureGroup = (scope: ProjectTerminalScope): ProjectTerminalGroup => {
    const existing = groups.get(scope.projectId);
    if (existing) return existing;
    const element = document.createElement("section");
    element.className = "zd-project-terminal-group";
    element.dataset.projectTerminalProject = scope.projectId;
    element.setAttribute("aria-label", `${scope.projectName} project terminal`);
    const group: ProjectTerminalGroup = {
      active: null,
      element,
      panes: [],
      projectId: scope.projectId,
      scope,
    };
    groups.set(scope.projectId, group);
    host.append(element);
    group.active = createPane(group);
    return group;
  };

  const shutdownPane = async (pane: ProjectTerminalPane): Promise<void> => {
    await pane.started;
    try {
      if (live(pane.session)) await pane.session.terminate();
      if (pane.session.snapshot().sessionId) await pane.session.dispose();
    } catch {
      // Native terminal teardown is best effort; the platform manager owns final cleanup.
    }
  };

  const afterTerminalLayout = (run: () => void): void => {
    // xterm queues its initial viewport sync across two animation frames. Rapid
    // teardown must let that work settle before disposal clears its dimensions.
    requestAnimationFrame(() => requestAnimationFrame(run));
  };

  const removeGroup = (projectId: string): Promise<void> => {
    const group = groups.get(projectId);
    if (!group) return Promise.resolve();
    groups.delete(projectId);
    for (const pane of group.panes) pane.surface.setVisible(false);
    group.element.hidden = true;
    afterTerminalLayout(() => {
      for (const pane of group.panes) pane.surface.dispose();
      group.element.remove();
    });
    return Promise.all(group.panes.map(shutdownPane)).then(() => undefined);
  };

  const activeGroup = (): ProjectTerminalGroup | null => {
    const projectId = context.state.snapshot().active.projectId;
    return projectId ? (groups.get(projectId) ?? null) : null;
  };

  const render = (state: WorkbenchState): void => {
    const projectIds = new Set(state.projects.map(({ id }) => id));
    for (const projectId of groups.keys()) {
      if (!projectIds.has(projectId)) void removeGroup(projectId);
    }

    const projectId = state.active.projectId;
    const scope = projectId ? scopeForProject(state, projectId) : null;
    if (!scope) {
      delete host.dataset.terminalProjectId;
      for (const group of groups.values()) {
        for (const pane of group.panes) pane.surface.setVisible(false);
        group.element.hidden = true;
      }
      host.hidden = true;
      return;
    }
    host.dataset.terminalProjectId = scope.projectId;
    const active = visible ? ensureGroup(scope) : groups.get(scope.projectId);
    if (visible) host.hidden = false;
    for (const group of groups.values()) {
      const shown = visible && group === active;
      if (shown) {
        group.element.hidden = false;
        for (const pane of group.panes) pane.surface.setVisible(true);
      } else {
        for (const pane of group.panes) pane.surface.setVisible(false);
        group.element.hidden = true;
      }
    }
    if (!visible) host.hidden = true;
    if (visible) queueMicrotask(() => active?.active?.surface.fit());
  };

  const setVisible = (next: boolean): void => {
    visible = next;
    render(context.state.snapshot());
    if (visible) queueMicrotask(() => activeGroup()?.active?.surface.focus());
  };

  const split = (): boolean => {
    const group = activeGroup();
    if (!visible || !group) return false;
    const pane = createPane(group);
    queueMicrotask(() => pane.surface.focus());
    return true;
  };

  const unsplit = (): boolean => {
    const group = activeGroup();
    if (!visible || !group || group.panes.length < 2) return false;
    const removed = group.active;
    if (!removed) return false;
    const index = group.panes.indexOf(removed);
    group.panes.splice(index, 1);
    group.active = group.panes[Math.max(0, index - 1)]!;
    removed.surface.setVisible(false);
    removed.element.hidden = true;
    delete removed.element.dataset.projectTerminalPane;
    updateGroup(group);
    afterTerminalLayout(() => {
      removed.surface.dispose();
      removed.element.remove();
      void shutdownPane(removed);
    });
    queueMicrotask(() => group.active?.surface.focus());
    return true;
  };

  const outputReady = (handle: TerminalSessionHandle): void => {
    const pane = [...groups.values()]
      .flatMap(({ panes }) => panes)
      .find(({ session }) => {
        const snapshot = session.snapshot();
        return (
          snapshot.sessionId === handle.sessionId &&
          session.scope.projectId === handle.projectId &&
          session.scope.worktreeId === handle.worktreeId
        );
      });
    if (pane) void pane.session.refresh().then(() => pane.session.pollExit());
  };

  const stopOutput = context.platform.terminal.onOutputReady?.(outputReady) ?? (() => {});
  const stopState = context.state.subscribe(render);
  const stopRemoval = context.state.registerProjectRemovalGuard({
    id: "workbench.project-terminal",
    prepareRemoval: ({ projectId }) => {
      const group = groups.get(projectId);
      const livePanes = group?.panes.filter(({ session }) => live(session)) ?? [];
      if (livePanes.length === 0) return { status: "ready" };
      return {
        status: "refused",
        reason: `${livePanes.length} project terminal${livePanes.length === 1 ? " is" : "s are"} still running`,
        recovery: {
          label:
            livePanes.length === 1 ? "Terminate project terminal" : "Terminate project terminals",
          run: () => removeGroup(projectId),
        },
      };
    },
  });
  const stopToggle = registerCommandTarget({
    id: "project-terminal.toggle",
    commandId: "projectTerminal.toggle",
    priority: 100,
    available: () => {
      const projectId = context.state.snapshot().active.projectId;
      return Boolean(projectId && scopeForProject(context.state.snapshot(), projectId));
    },
    run: () => {
      setVisible(!visible);
      return true;
    },
  });
  const stopSplit = registerCommandTarget({
    id: "project-terminal.split",
    commandId: "projectTerminal.split",
    priority: 100,
    available: () => visible && activeGroup() !== null,
    run: split,
  });
  const stopUnsplit = registerCommandTarget({
    id: "project-terminal.unsplit",
    commandId: "projectTerminal.unsplit",
    priority: 100,
    available: () => visible && (activeGroup()?.panes.length ?? 0) > 1,
    run: unsplit,
  });
  const stopFind = registerCommandTarget({
    id: "project-terminal.find",
    commandId: "file.find",
    priority: 210,
    available: () => visible && host.contains(document.activeElement),
    run: () => {
      const surface = activeGroup()?.active?.surface;
      if (!surface) return false;
      surface.openSearch();
      return true;
    },
  });
  const stopEscape = registerCommandTarget({
    id: "project-terminal.dismiss-search",
    commandId: "workbench.escape",
    priority: 320,
    available: () => activeGroup()?.active?.surface.isSearchOpen() ?? false,
    run: () => activeGroup()?.active?.surface.closeSearch() ?? false,
  });

  render(context.state.snapshot());
  return () => {
    if (disposed) return;
    disposed = true;
    stopEscape();
    stopFind();
    stopUnsplit();
    stopSplit();
    stopToggle();
    stopRemoval();
    stopState();
    stopOutput();
    for (const projectId of [...groups.keys()]) void removeGroup(projectId);
    host.replaceChildren();
  };
}
