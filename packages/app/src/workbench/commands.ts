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

function updateRegionFocus(
  context: WorkbenchRuntimeContext,
  focus: WorkbenchRegions["focus"],
): void {
  context.state.updateRegions({ ...context.state.snapshot().regions, focus });
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
      chord: { key: "f", mod: true },
      description: "Find in the current file",
      available: () => commandTargetAvailable("file.find"),
      run: () => runCommandTarget("file.find"),
    }),
    register({
      id: "focus.toggle",
      chord: { key: "f", mod: true, shift: true },
      description: "Turn Focus Mode on or off",
      available: () => commandTargetAvailable("focus.toggle"),
      run: () => runCommandTarget("focus.toggle"),
    }),
  );

  for (let projectIndex = 0; projectIndex < 9; projectIndex += 1) {
    const number = projectIndex + 1;
    cleanups.push(
      register({
        id: `project.activate.${number}`,
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
      id: "thread.focus",
      chord: { key: "j", mod: true },
      description: "Focus the active terminal thread",
      available: () => context.state.snapshot().active.threadId !== null,
      run: () => {
        if (context.state.snapshot().active.threadId === null) return false;
        updateRegionFocus(context, "thread");
        host.querySelector<HTMLElement>('[data-centre-surface="thread"]')?.focus({
          preventScroll: true,
        });
        return true;
      },
    }),
    register({
      id: "command.list",
      chord: { key: "p", mod: true, shift: true },
      description: "Open the Command List",
      available: () => commandTargetAvailable("command.list"),
      run: () => runCommandTarget("command.list"),
    }),
    register({
      id: "window.summon",
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
