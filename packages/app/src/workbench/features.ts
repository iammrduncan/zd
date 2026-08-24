import { mountChanges } from "@/changes";
import { mountFileTree } from "@/files";
import { mountProjectList, ProjectsController } from "@/projects";
import {
  mountProjectThreads,
  mountTerminalThreadSurface,
  ThreadsController,
  type TerminalThreadSession,
  type TerminalThreadSurface,
  type TerminalThreadSurfaceOptions,
  type ThreadInstrumentationEvent,
} from "@/threads";
import { createWorkbenchChangesRuntime, mountCurrentFileWithChanges } from "./changes";
import { createWorkbenchFilesRuntime } from "./files";
import { createWorkbenchAttentionRuntime } from "./notifications";
import { createProjectWorkbenchAdapter } from "./projects";
import type { Unmount, WorkbenchMount, WorkbenchRuntimeContext } from "./runtime";
import { mountWorkbenchShell } from "./shell";
import { registerCommandTarget } from "./shortcuts";
import { mountWorkbenchSettings } from "./settings";
import { FileDraftStore } from "./current-file/drafts";
import { createRootThreadsAdapter, type RootThreadsAdapter } from "./threads";

function recordThreadAction(
  context: WorkbenchRuntimeContext,
  event: ThreadInstrumentationEvent,
): void {
  void context.instrumentation.record({
    recordType: "event",
    operation: event.operation,
    outcome: event.outcome,
    ...((event.projectId || event.worktreeId || event.threadId) && {
      context: {
        ...(event.projectId ? { projectId: event.projectId } : {}),
        ...(event.worktreeId ? { worktreeId: event.worktreeId } : {}),
        ...(event.threadId ? { threadId: event.threadId } : {}),
      },
    }),
  });
}

function threadsNavigationMount(
  threads: ThreadsController,
  attention: Awaited<ReturnType<typeof createWorkbenchAttentionRuntime>>["settings"],
): WorkbenchMount {
  return (host, context) => {
    const projects = new ProjectsController(
      createProjectWorkbenchAdapter(context.state, context.platform, context.instrumentation),
    );
    const stopProjects = mountProjectList(host, projects, {
      renderFooterActions: (actionHost) => {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "zd-project-collapse";
        toggle.dataset.projectsCollapse = "true";
        let pending = false;
        const renderToggle = () => {
          const collapsed = threads.snapshot().visibility === "collapsed";
          const label = collapsed ? "Expand Projects pane" : "Collapse Projects pane";
          toggle.setAttribute("aria-label", label);
          toggle.setAttribute("aria-expanded", String(!collapsed));
          toggle.title = label;
          toggle.textContent = collapsed ? "›" : "‹";
        };
        const toggleVisibility = async () => {
          if (pending) return;
          pending = true;
          toggle.disabled = true;
          try {
            const next = threads.snapshot().visibility === "collapsed" ? "full" : "collapsed";
            await threads.setVisibility(next);
          } finally {
            pending = false;
            toggle.disabled = false;
          }
        };
        toggle.addEventListener("click", () => {
          void toggleVisibility();
        });
        renderToggle();
        const stopThreads = threads.subscribe(renderToggle);
        actionHost.append(toggle);
        return () => {
          stopThreads();
          toggle.remove();
        };
      },
      renderChildren: (project, children, actionHost) =>
        mountProjectThreads(children, threads, project.id, {
          projectName: project.name,
          actionHost,
          workspaces: project.worktrees.map((worktree) => ({
            id: worktree.id,
            label: worktree.name,
            root: worktree.root,
            kind: worktree.root === project.root ? "project-root" : "worktree",
            availability: worktree.availability,
          })),
        }),
    });
    const stopSettings = mountWorkbenchSettings(
      host.closest<HTMLElement>(".zd-workbench") ?? host,
      context.instrumentation,
      context.platform.revealDiagnostics,
      attention,
      context.transients,
      context.state,
    );
    return () => {
      stopSettings();
      stopProjects();
    };
  };
}

export function mountActiveThread(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  threads: RootThreadsAdapter,
  surfaceOptions: TerminalThreadSurfaceOptions = {},
): Unmount {
  const empty = document.createElement("p");
  empty.className = "zd-region-empty";
  host.replaceChildren(empty);
  const mounted = new Map<
    string,
    { session: TerminalThreadSession; surface: TerminalThreadSurface }
  >();
  let activeThreadId: string | null = null;

  const activeSurface = () =>
    activeThreadId ? (mounted.get(activeThreadId)?.surface ?? null) : null;

  const render = () => {
    const snapshot = threads.snapshot();
    const threadId = snapshot.activeThreadId;
    const currentThreads = new Map(snapshot.threads.map((thread) => [thread.id, thread]));
    for (const [id, mountedThread] of mounted) {
      if (!currentThreads.has(id) || threads.session(id) !== mountedThread.session) {
        mountedThread.surface.dispose();
        mounted.delete(id);
      }
    }
    activeThreadId = threadId;

    if (!threadId) {
      empty.textContent = "No thread selected.";
      empty.hidden = false;
      for (const mountedThread of mounted.values()) mountedThread.surface.setVisible(false);
      return;
    }
    const thread = snapshot.threads.find(({ id }) => id === threadId);
    const session = threads.session(threadId);
    if (!thread || !session) {
      empty.textContent =
        thread?.recovery?.summary ?? "The selected terminal session is unavailable.";
      empty.hidden = false;
      for (const mountedThread of mounted.values()) mountedThread.surface.setVisible(false);
      return;
    }
    const project = snapshot.projects.find(({ id }) => id === thread.projectId);
    const metadata = {
      threadName: thread.name,
      projectName: project?.name ?? thread.projectId,
      worktreeLabel: thread.worktree.label,
    };
    let mountedThread = mounted.get(threadId);
    if (!mountedThread) {
      mountedThread = {
        session,
        surface: mountTerminalThreadSurface(host, session, metadata, {
          ...surfaceOptions,
          onTitleChange: (title) => {
            surfaceOptions.onTitleChange?.(title);
            void threads.updateAutomaticName(threadId, title);
          },
        }),
      };
      mounted.set(threadId, mountedThread);
    } else {
      mountedThread.surface.updateMetadata(metadata);
    }
    empty.hidden = true;
    for (const [id, candidate] of mounted) candidate.surface.setVisible(id === threadId);
  };

  render();
  const stopState = context.state.subscribe(render);
  const focusTerminal = () => activeSurface()?.focus();
  host.addEventListener("focus", focusTerminal);
  const stopFind = registerCommandTarget({
    id: "active-terminal.find",
    commandId: "file.find",
    priority: 200,
    available: () => {
      const surface = activeSurface();
      return Boolean(
        surface &&
        (document.activeElement === host || surface.element.contains(document.activeElement)),
      );
    },
    run: () => {
      const surface = activeSurface();
      if (!surface) return false;
      surface.openSearch();
      return true;
    },
  });
  const stopDismissSearch = registerCommandTarget({
    id: "active-terminal.dismiss-search",
    commandId: "workbench.escape",
    priority: 310,
    available: () => activeSurface()?.isSearchOpen() ?? false,
    run: () => activeSurface()?.closeSearch() ?? false,
  });
  return () => {
    stopDismissSearch();
    stopFind();
    host.removeEventListener("focus", focusTerminal);
    stopState();
    for (const mountedThread of mounted.values()) mountedThread.surface.dispose();
    mounted.clear();
    empty.remove();
  };
}

/** Mount all landed workbench features against the single root runtime context. */
export async function mountWorkbenchFeatures(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
): Promise<Unmount> {
  const threadsAdapter = createRootThreadsAdapter(context.state, context.platform, {
    instrumentation: context.instrumentation,
  });
  const threads = new ThreadsController(threadsAdapter, (event) =>
    recordThreadAction(context, event),
  );
  const attention = await createWorkbenchAttentionRuntime(
    context.state,
    context.platform,
    threadsAdapter,
    context.instrumentation,
  );
  const stopAttention = attention.attach();
  const drafts = new FileDraftStore();
  const files = createWorkbenchFilesRuntime(
    context.state,
    context.platform.fileTree,
    context.platform.git,
    context.instrumentation,
    drafts,
    undefined,
    () => context.platform.projectGrants(),
  );
  const stopFilesRuntime = files.attach();
  const changes = createWorkbenchChangesRuntime(
    context.state,
    context.platform.git,
    files,
    context.instrumentation,
  );
  const stopChangesRuntime = changes.attach();

  let stopShell: Unmount;
  try {
    stopShell = await mountWorkbenchShell(host, context, {
      threads: threadsNavigationMount(threads, attention.settings),
      thread: (threadHost, threadContext) =>
        mountActiveThread(threadHost, threadContext, threadsAdapter),
      file: (fileHost, fileContext) =>
        mountCurrentFileWithChanges(fileHost, fileContext, changes.controller, drafts),
      files: (filesHost) => mountFileTree(filesHost, files.controller, context.transients),
      changes: (changesHost) => mountChanges(changesHost, changes.controller),
    });
  } catch (cause) {
    stopChangesRuntime();
    stopFilesRuntime();
    stopAttention();
    void threadsAdapter.dispose();
    throw cause;
  }

  return () => {
    stopShell();
    stopChangesRuntime();
    stopFilesRuntime();
    stopAttention();
    void threadsAdapter.dispose();
  };
}
