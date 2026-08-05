import type { WorkspaceFile } from "@/platform";
import type { SuiteContext, Unmount } from "@/suite/types";
import { mountSidebarResizer } from "./workspace-resize";
import { buildFileTree } from "./workspace-tree";
import { mountReview, type ReviewDocument } from "./review";

export interface MountedDocument {
  canSwitch(): boolean;
  unmount: Unmount;
}

export type DocumentMount = (
  host: HTMLElement,
  context: SuiteContext,
  review?: ReviewDocument,
) => Promise<MountedDocument>;

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function parentPath(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator <= 0 ? path.slice(0, Math.max(0, separator + 1)) : path.slice(0, separator);
}

/**
 * Put the scoped file tree beside one document and replace that document on selection.
 *
 * The document lifecycle stays below this boundary. A switch tears down the old
 * editor completely before mounting the next one, so its path, save stamp, focus
 * listener, and shortcuts cannot leak across files.
 */
export async function mountWorkspace(
  host: HTMLElement,
  context: SuiteContext,
  mountDocument: DocumentMount,
): Promise<Unmount> {
  const listing = await context.platform.workspaceFiles().catch(() => null);
  if (!listing) {
    const path = context.launch.path;
    const review = mountReview({
      host,
      root: path ? parentPath(path) : "",
      platform: context.platform,
    });
    const document_ = await mountDocument(
      host,
      context,
      path ? review.document({ path, relative: fileName(path) }) : undefined,
    );
    return () => {
      document_.unmount();
      review.unmount();
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

  const launched = context.launch.path;
  const launchIsUnlistedFile =
    launched !== null &&
    launched !== listing.root &&
    !listing.files.some((file) => file.path === launched);
  const candidates = launchIsUnlistedFile
    ? [...listing.files, { path: launched, relative: fileName(launched) }]
    : listing.files;
  const files = [...candidates].sort((left, right) => {
    if (left.relative < right.relative) return -1;
    if (left.relative > right.relative) return 1;
    return 0;
  });
  let current: MountedDocument | null = null;
  let activePath: string | null = null;
  let opening = false;

  let buttons = new Map<string, HTMLButtonElement>();
  const select = (path: string) => {
    for (const [candidate, button] of buttons) {
      if (candidate === path) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  };

  const open = async (file: WorkspaceFile) => {
    if (opening || file.path === activePath) return;
    if (current && !current.canSwitch()) return;

    opening = true;
    try {
      current?.unmount();
      current = null;
      activePath = file.path;
      select(file.path);
      current = await mountDocument(
        documentHost,
        {
          ...context,
          launch: { ...context.launch, path: file.path },
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
    platform: context.platform,
  });

  const initial = files.find((file) => file.path === context.launch.path) ?? files[0];
  if (initial) {
    await open(initial);
  } else {
    const empty = document.createElement("p");
    empty.className = "md-workspace-empty";
    empty.textContent = `No Markdown files in ${listing.root}`;
    documentHost.append(empty);
  }

  return () => {
    current?.unmount();
    resizer.unmount();
    review.unmount();
    tree.unmount();
    shell.remove();
  };
}
