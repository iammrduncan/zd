import {
  commandTargetAvailable,
  register,
  registerCommandObserver,
  registerCommandTarget,
  runCommandTarget,
} from "./shortcuts";
import type { Unmount, WorkbenchRuntimeContext } from "./runtime";
import type { WorkbenchRegions } from "./state";

export interface WorkbenchCommandsAttachment {
  readonly ready: Promise<readonly string[]>;
  readonly detach: Unmount;
}

function projectId(context: WorkbenchRuntimeContext, projectIndex: number): string | null {
  return context.state.snapshot().projects[projectIndex]?.id ?? null;
}

function relativeProjectId(context: WorkbenchRuntimeContext, direction: -1 | 1): string | null {
  const state = context.state.snapshot();
  if (state.projects.length < 2) return null;
  const current = state.projects.findIndex(({ id }) => id === state.active.projectId);
  const next =
    current < 0
      ? direction > 0
        ? 0
        : state.projects.length - 1
      : (current + direction + state.projects.length) % state.projects.length;
  return state.projects[next]?.id ?? null;
}

function updateRegionFocus(
  context: WorkbenchRuntimeContext,
  focus: WorkbenchRegions["focus"],
): void {
  context.state.updateRegions({ ...context.state.snapshot().regions, focus });
}

function centreToggleTarget(context: WorkbenchRuntimeContext): "thread" | "file" | null {
  const state = context.state.snapshot();
  const threadOwnsCentre = state.regions.focus === "thread" || state.regions.focus === "threads";
  if (threadOwnsCentre && state.active.fileId !== null) return "file";
  if (!threadOwnsCentre && state.active.threadId !== null) return "thread";
  if (state.active.threadId !== null) return "thread";
  if (state.active.fileId !== null) return "file";
  return null;
}

/** Register the stable, workbench-wide command identities and their one native shortcut. */
export function attachWorkbenchCommands(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
): WorkbenchCommandsAttachment {
  const cleanups: Unmount[] = [];
  const notices: string[] = [];
  let registration = {
    supported: false,
    registered: false,
    shortcut: "CmdOrCtrl+Shift+Space",
    problem: null as string | null,
  };
  cleanups.push(
    registerCommandObserver((commandId) => {
      void context.instrumentation.record({
        recordType: "event",
        operation: `command.${commandId}`,
        outcome: "ok",
      });
    }),
  );

  cleanups.push(
    context.platform.onWindowPresentationChanged((presentation) => {
      context.state.setWindowPresentation(presentation);
    }),
    registerCommandTarget({
      id: "window.quickAccessEscape",
      commandId: "workbench.escape",
      priority: 100,
      available: () => context.state.snapshot().window.presentation === "quick-access",
      run: () => {
        void context.platform
          .hideQuickAccess()
          .then((presentation) => context.state.setWindowPresentation(presentation));
        return true;
      },
    }),
  );

  const ready = (async (): Promise<readonly string[]> => {
    try {
      registration = await context.platform.registerGlobalSummon();
    } catch (cause) {
      registration = {
        supported: true,
        registered: false,
        shortcut: registration.shortcut,
        problem: cause instanceof Error ? cause.message : String(cause),
      };
    }
    if (registration.supported && !registration.registered) {
      notices.push(
        `Global shortcut ${registration.shortcut} could not be registered: ${registration.problem ?? "unknown conflict"}. Choose a different system shortcut, then relaunch zd.`,
      );
    }
    return notices;
  })();

  cleanups.push(
    register({
      id: "file.find",
      category: "Editor/Reading",
      chord: { key: "f", mod: true },
      description: "Find in the current file",
      available: () => commandTargetAvailable("file.find"),
      run: () => runCommandTarget("file.find"),
    }),
    register({
      id: "focus.toggle",
      category: "Editor/Reading",
      chord: { key: "f", mod: true, shift: true },
      description: "Turn Focus Mode on or off",
      available: () => commandTargetAvailable("focus.toggle"),
      run: () => runCommandTarget("focus.toggle"),
    }),
    register({
      id: "files.filter",
      category: "Files",
      chord: { key: "p", mod: true },
      description: "Filter the active file tree",
      available: () => commandTargetAvailable("files.filter"),
      run: () => runCommandTarget("files.filter"),
    }),
    register({
      id: "files.toggleVisibility",
      category: "Files",
      chord: { key: "b", mod: true, shift: true },
      description: "Show or hide Files and Changes",
      available: () => commandTargetAvailable("files.toggleVisibility"),
      run: () => runCommandTarget("files.toggleVisibility"),
    }),
    register({
      id: "projects.toggleVisibility",
      category: "Projects/Threads",
      description: "Show or hide Projects",
      available: () => commandTargetAvailable("projects.toggleVisibility"),
      run: () => runCommandTarget("projects.toggleVisibility"),
    }),
    register({
      id: "settings.open",
      category: "Workbench",
      chord: { key: ",", mod: true },
      description: "Open or close Settings",
      available: () => commandTargetAvailable("settings.open"),
      run: () => runCommandTarget("settings.open"),
    }),
  );

  for (let projectIndex = 0; projectIndex < 9; projectIndex += 1) {
    const number = projectIndex + 1;
    cleanups.push(
      register({
        id: `project.activate.${number}`,
        category: "Projects/Threads",
        chord: { key: String(number), mod: true },
        description: `Activate project ${number}`,
        available: () => projectId(context, projectIndex) !== null,
        run: () => {
          const target = projectId(context, projectIndex);
          if (!target) return false;
          void context.state.activateProject(target);
          return true;
        },
      }),
    );
  }

  cleanups.push(
    register({
      id: "project.previous",
      category: "Projects/Threads",
      chord: { key: "ArrowUp", mod: true, alt: true },
      description: "Activate the previous project",
      available: () => relativeProjectId(context, -1) !== null,
      run: () => {
        const target = relativeProjectId(context, -1);
        if (!target) return false;
        void context.state.activateProject(target);
        return true;
      },
    }),
    register({
      id: "project.next",
      category: "Projects/Threads",
      chord: { key: "ArrowDown", mod: true, alt: true },
      description: "Activate the next project",
      available: () => relativeProjectId(context, 1) !== null,
      run: () => {
        const target = relativeProjectId(context, 1);
        if (!target) return false;
        void context.state.activateProject(target);
        return true;
      },
    }),
    register({
      id: "thread.create",
      category: "Projects/Threads",
      chord: { key: "n", mod: true },
      description: "Start a terminal thread in the active project",
      available: () => commandTargetAvailable("thread.create"),
      run: () => runCommandTarget("thread.create"),
    }),
    register({
      id: "centre.toggle",
      category: "Workbench",
      chord: { key: "j", mod: true },
      description: "Switch between the current thread and file",
      available: () => centreToggleTarget(context) !== null,
      run: () => {
        const region = centreToggleTarget(context);
        if (!region) return false;
        const target = host.querySelector<HTMLElement>(`[data-centre-surface="${region}"]`);
        if (!target) return false;
        updateRegionFocus(context, region);
        target.focus({ preventScroll: true });
        return true;
      },
    }),
    register({
      id: "command.list",
      category: "Workbench",
      chord: { key: "p", mod: true, shift: true },
      description: "Open the Command List",
      available: () => commandTargetAvailable("command.list"),
      run: () => runCommandTarget("command.list"),
    }),
    register({
      id: "window.summon",
      category: "Help/System",
      chord: { key: " ", mod: true, shift: true },
      scope: "global",
      description: "Summon or hide the workbench",
      available: () => registration.registered,
      run: () => {
        if (!registration.registered) return false;
        void context.platform
          .toggleQuickAccess()
          .then((presentation) => context.state.setWindowPresentation(presentation));
        return true;
      },
    }),
    register({
      id: "workbench.escape",
      category: "Workbench",
      chord: { key: "Escape" },
      description: "Dismiss the active transient or leave the current mode",
      available: () => commandTargetAvailable("workbench.escape"),
      run: () => runCommandTarget("workbench.escape"),
    }),
  );

  let attached = true;
  return {
    ready,
    detach: () => {
      if (!attached) return;
      attached = false;
      for (const cleanup of [...cleanups].reverse()) cleanup();
    },
  };
}
