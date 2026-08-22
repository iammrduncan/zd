import { mountFileTree } from "@/files";
import { mountProjectList, ProjectsController } from "@/projects";
import {
  mountProjectThreads,
  mountTerminalThreadSurface,
  ThreadsController,
  type ThreadInstrumentationEvent,
} from "@/threads";
import { mountCurrentFile } from "./current-file";
import { mountDiagnosticSettings } from "./diagnostics";
import { createWorkbenchFilesRuntime } from "./files";
import { createProjectWorkbenchAdapter } from "./projects";
import type { Unmount, WorkbenchMount, WorkbenchRuntimeContext } from "./runtime";
import { mountWorkbenchShell } from "./shell";
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

function threadsNavigationMount(threads: ThreadsController): WorkbenchMount {
  return (host, context) => {
    const projects = new ProjectsController(
      createProjectWorkbenchAdapter(context.state, context.platform, context.instrumentation),
    );
    const stopProjects = mountProjectList(host, projects, {
      renderChildren: (project, children) => mountProjectThreads(children, threads, project.id),
    });
    const stopDiagnostics = mountDiagnosticSettings(
      host,
      context.instrumentation,
      context.platform.revealDiagnostics,
    );
    return () => {
      stopDiagnostics();
      stopProjects();
    };
  };
}

function emptyThreadSurface(host: HTMLElement, message: string): void {
  const empty = document.createElement("p");
  empty.className = "zd-region-empty";
  empty.textContent = message;
  host.replaceChildren(empty);
}

export function mountActiveThread(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  threads: RootThreadsAdapter,
): Unmount {
  let stopSurface: Unmount = () => {};
  let mountedId: string | null = null;
  let mountedSession = threads.session("");

  const render = () => {
    const snapshot = threads.snapshot();
    const threadId = snapshot.activeThreadId;
    const session = threadId ? threads.session(threadId) : null;
    if (threadId === mountedId && session === mountedSession) return;
    stopSurface();
    stopSurface = () => {};
    mountedId = threadId;
    mountedSession = session;

    if (!threadId) {
      emptyThreadSurface(host, "No thread selected.");
      return;
    }
    const thread = snapshot.threads.find(({ id }) => id === threadId);
    if (!thread || !session) {
      emptyThreadSurface(
        host,
        thread?.recovery?.summary ?? "The selected terminal session is unavailable.",
      );
      return;
    }
    const project = snapshot.projects.find(({ id }) => id === thread.projectId);
    host.replaceChildren();
    stopSurface = mountTerminalThreadSurface(host, session, {
      threadName: thread.name,
      projectName: project?.name ?? thread.projectId,
      worktreeLabel: thread.worktree.label,
    });
  };

  render();
  const stopState = context.state.subscribe(render);
  return () => {
    stopState();
    stopSurface();
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
  const files = createWorkbenchFilesRuntime(
    context.state,
    context.platform.fileTree,
    context.platform.git,
    context.instrumentation,
  );
  const stopFilesRuntime = files.attach();

  let stopShell: Unmount;
  try {
    stopShell = await mountWorkbenchShell(host, context, {
      threads: threadsNavigationMount(threads),
      thread: (threadHost, threadContext) =>
        mountActiveThread(threadHost, threadContext, threadsAdapter),
      file: mountCurrentFile,
      files: (filesHost) => mountFileTree(filesHost, files.controller),
    });
  } catch (cause) {
    stopFilesRuntime();
    void threadsAdapter.dispose();
    throw cause;
  }

  return () => {
    stopShell();
    stopFilesRuntime();
    void threadsAdapter.dispose();
  };
}
