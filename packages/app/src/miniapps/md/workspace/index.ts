import type { WorkspaceFile } from "@/platform";
import type { WorkbenchRuntimeContext, Unmount } from "@/workbench/runtime";
import { launchResource, resourceKey } from "@/workbench/resources";
import { fileStateId } from "@/workbench/state";
import { mountReview, type ReviewDocument } from "../review";
import { mountSidebarResizer } from "./resize";
import { buildFileTree } from "./tree";

export interface MountedDocument {
  canSwitch(): boolean;
  unmount: Unmount;
}

export type DocumentMount = (
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  review?: ReviewDocument,
) => Promise<MountedDocument>;

interface MountedWorkspace {
  canSwitch(): boolean;
  unmount: Unmount;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

/**
 * Put the scoped file tree beside one document and replace that document on selection.
 *
 * The document lifecycle stays below this boundary. A switch tears down the old
 * editor completely before mounting the next one, so its path, save stamp, focus
 * listener, and shortcuts cannot leak across files.
 */
async function mountWorkspaceSession(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  mountDocument: DocumentMount,
): Promise<MountedWorkspace> {
  const project = context.launch.project;
  const worktreeId = context.launch.worktreeId;
  const listing =
    project && worktreeId
      ? await context.platform.workspaceFiles(project.id, worktreeId).catch(() => null)
      : null;
  if (!listing) {
    const resource = launchResource(context.launch);
    const review = mountReview({
      host,
      root: project?.root ?? "",
      rootResource:
        project && worktreeId ? { projectId: project.id, worktreeId } : null,
      platform: context.platform,
    });
    const document_ = await mountDocument(
      host,
      context,
      resource
        ? review.document({ resource, relative: fileName(resource.relativePath) })
        : undefined,
    );
    return {
      canSwitch: document_.canSwitch,
      unmount: () => {
        document_.unmount();
        review.unmount();
      },
    };
  }

  const shell = document.createElement("div");
  shell.className = "md-workspace";

  const sidebar = document.createElement("aside");
  sidebar.className = "md-workspace-sidebar";
  sidebar.setAttribute("aria-label", `Files in ${listing.root}`);

  const documentHost = document.createElement("div");
  documentHost.className = "md-workspace-document";
  const resizer = mountSidebarResizer(sidebar);
  shell.append(sidebar, resizer.element, documentHost);
  host.replaceChildren(shell);
  resizer.sync();

  const launched = launchResource(context.launch);
  const launchIsUnlistedFile =
    launched !== null &&
    !listing.files.some((file) => resourceKey(file.resource) === resourceKey(launched));
  const candidates = launchIsUnlistedFile
    ? [...listing.files, { resource: launched, relative: fileName(launched.relativePath) }]
    : listing.files;
  const files = [...candidates].sort((left, right) => {
    if (left.relative < right.relative) return -1;
    if (left.relative > right.relative) return 1;
    return 0;
  });
  let current: MountedDocument | null = null;
  let opening = false;

  let buttons = new Map<string, HTMLButtonElement>();
  const select = (key: string) => {
    for (const [candidate, button] of buttons) {
      if (candidate === key) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  };

  const open = async (file: WorkspaceFile) => {
    const key = resourceKey(file.resource);
    if (
      opening ||
      (current !== null && context.state.snapshot().active.fileId === fileStateId(file.resource))
    ) {
      return;
    }

    opening = true;
    try {
      const activation = await context.state.activateFile(file.resource);
      if (activation.status === "refused") return;
      current?.unmount();
      current = null;
      select(key);
      current = await mountDocument(
        documentHost,
        {
          ...context,
          launch: {
            ...context.launch,
            project,
            worktreeId: file.resource.worktreeId,
            relativePath: file.resource.relativePath,
            problem: null,
          },
        },
        review.document(file),
      );
    } finally {
      opening = false;
    }
  };

  const tree = buildFileTree(files, (selected) => void open(selected));
  buttons = tree.buttons;
  sidebar.append(tree.element);
  const review = mountReview({
    host,
    launcherHost: sidebar,
    root: listing.root,
    rootResource: { projectId: listing.projectId, worktreeId: listing.worktreeId },
    platform: context.platform,
  });

  const launchedKey = launched ? resourceKey(launched) : null;
  const initial = files.find((file) => resourceKey(file.resource) === launchedKey) ?? files[0];
  if (initial) {
    await open(initial);
  } else {
    const empty = document.createElement("p");
    empty.className = "md-workspace-empty";
    empty.textContent = `No Markdown files in ${listing.root}`;
    documentHost.append(empty);
  }

  return {
    canSwitch: () => current?.canSwitch() ?? true,
    unmount: () => {
      current?.unmount();
      resizer.unmount();
      review.unmount();
      tree.unmount();
      shell.remove();
    },
  };
}

/**
 * Keep one native window aligned with Finder file-open requests.
 *
 * The native side queues an already-granted resource without changing active
 * context. Root transition guards run against that pending request; only an
 * approved transition is accepted and remounted.
 */
export async function mountWorkspace(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  mountDocument: DocumentMount,
): Promise<Unmount> {
  let mounted = await mountWorkspaceSession(host, context, mountDocument);
  let switching = false;
  let disposed = false;
  const stopGuard = context.state.registerTransitionGuard({
    id: "workbench.current-document",
    prepare: ({ from, to }) => {
      if (from.fileId === to.fileId || mounted.canSwitch()) return { status: "ready" };
      return { status: "refused", reason: "The current document has unsaved work" };
    },
  });

  const stopListening = context.platform.onOpenRequested(() => {
    if (disposed || switching) return;

    switching = true;
    void (async () => {
      const pending = await context.platform.pendingOpenRequest();
      if (!pending || disposed) return;
      const grants = await context.platform
        .projectGrants()
        .catch(() => (pending.project ? [pending.project] : []));
      const transition = await context.state.applyLaunch(pending, grants);
      if (transition.status === "refused") return;
      const launch = await context.platform.acceptOpenRequest();
      if (!launch || disposed) return;

      mounted.unmount();
      mounted = await mountWorkspaceSession(
        host,
        {
          ...context,
          launch,
        },
        mountDocument,
      );
    })().finally(() => {
      switching = false;
    });
  });

  return () => {
    disposed = true;
    stopGuard();
    stopListening();
    mounted.unmount();
  };
}
