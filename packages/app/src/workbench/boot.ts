import type { Platform } from "@/platform";
import { registerThemeSelectionOwner } from "@/design/appearance";
import { ThemeController, loadThemeCatalog } from "@/design/themes";
import { mountCurrentWorkspace } from "@/miniapps/md";
import { mountProjectList, ProjectsController } from "@/projects";
import { registerReference } from "./reference";
import { attachShortcuts } from "./shortcuts";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "./state";
import { attachWorkbenchCommands } from "./commands";
import { createProjectWorkbenchAdapter } from "./projects";
import { mountWorkbenchShell } from "./shell";
import type { Unmount, WorkbenchMount } from "./runtime";

export type { WorkbenchMount } from "./runtime";

const NOTHING: Unmount = () => {};
const mountProjects: WorkbenchMount = (host, context) =>
  mountProjectList(
    host,
    new ProjectsController(createProjectWorkbenchAdapter(context.state, context.platform)),
  );
const mountCurrentEditor: WorkbenchMount = (host, context) =>
  mountWorkbenchShell(host, context, {
    threads: mountProjects,
    file: mountCurrentWorkspace,
  });

function saySoOnScreen(host: HTMLElement, message: string): void {
  const line = document.createElement("p");
  line.className = "zd-boot-notice";
  line.textContent = message;
  host.replaceChildren(line);
}

function showLocalNotices(host: HTMLElement, notices: readonly string[]): void {
  if (notices.length === 0) return;
  const line = document.createElement("p");
  line.className = "zd-local-notice";
  line.setAttribute("role", "status");
  line.setAttribute("aria-label", "Configuration notice");
  line.textContent = notices.join(" ");
  host.append(line);
}

function reasonFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Boot the one workbench and return its complete teardown.
 *
 * Launch selects an approved project resource, never an application surface. The current Markdown
 * workspace remains the content mount until the new shell wraps it, but it is no
 * longer discovered through a selector or registry.
 */
export async function bootWorkbench(
  host: HTMLElement,
  platform: Platform,
  mount: WorkbenchMount = mountCurrentEditor,
): Promise<Unmount> {
  document.title = "zd";

  let launch;
  try {
    launch = await platform.launchRequest();
  } catch (cause) {
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  const detachShortcuts = attachShortcuts();
  const [grants, themeFiles] = await Promise.all([
    platform.projectGrants().catch(() => (launch.project ? [launch.project] : [])),
    platform
      .themeConfigFiles()
      .then((files) => ({ files, problem: null }))
      .catch((cause: unknown) => ({ files: [], problem: reasonFor(cause) })),
  ]);
  const state = createWorkbenchStateOwner(workbenchStateFromGrants(grants, launch));
  const catalog = loadThemeCatalog(themeFiles.files);
  const localNotices = catalog.notices.map(({ source, problem }) => `Theme ${source}: ${problem}`);
  if (themeFiles.problem) {
    localNotices.push(`Theme configuration directory: ${themeFiles.problem}`);
  }
  const theme = new ThemeController(document.documentElement, catalog, {
    ...state.snapshot().theme,
    onNotice: ({ source, problem }) => localNotices.push(`Theme ${source}: ${problem}`),
    onChange: ({ selected, lastValid }) => state.setThemeSelection(selected, lastValid),
  });
  const detachThemeState = state.subscribe(({ theme: selection }) => {
    const applied = theme.snapshot();
    if (selection.selected !== applied.selected || selection.lastValid !== applied.lastValid) {
      theme.setSelection(selection.selected, selection.lastValid);
    }
  });
  const detachThemeSelectionOwner = registerThemeSelectionOwner((selected) => {
    state.setThemeSelection(selected, theme.snapshot().lastValid);
  });
  const rootCommands = attachWorkbenchCommands(host, { launch, platform, state });
  const detachReference = registerReference(host);

  let unmount: Unmount;
  try {
    unmount = await mount(host, {
      launch,
      platform,
      state,
    });
  } catch (cause) {
    rootCommands.detach();
    detachThemeSelectionOwner();
    detachThemeState();
    theme.dispose();
    detachReference();
    detachShortcuts();
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  localNotices.push(...(await rootCommands.ready));
  showLocalNotices(host, localNotices);

  return () => {
    detachThemeSelectionOwner();
    detachThemeState();
    theme.dispose();
    detachReference();
    rootCommands.detach();
    detachShortcuts();
    unmount();
  };
}
