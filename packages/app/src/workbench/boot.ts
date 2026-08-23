import type { Platform } from "@/platform";
import { registerThemeSelectionOwner } from "@/design/appearance";
import { ThemeController, loadThemeCatalog } from "@/design/themes";
import { createInstrumentationClient } from "@/instrumentation";
import { registerReference } from "./reference";
import { attachShortcuts } from "./shortcuts";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "./state";
import { attachWorkbenchCommands } from "./commands";
import { mountCommandList } from "./command-list";
import { restoreShortcutBindings } from "./shortcut-settings";
import { mountWindowChrome } from "./chrome";
import { attachWorkbenchDiagnostics } from "./diagnostics";
import { diagnosticsEnabled, setDiagnosticsEnabled } from "./preferences";
import { mountWorkbenchFeatures } from "./features";
import { attachOpenRequests } from "./open-requests";
import type { Unmount, WorkbenchMount } from "./runtime";

export type { WorkbenchMount } from "./runtime";

const NOTHING: Unmount = () => {};

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
 * Launch selects an approved project resource, never an application surface. The
 * root shell mounts the shared editor facade against that active file and keeps
 * all project/worktree/file transitions in the one state owner.
 */
export async function bootWorkbench(
  host: HTMLElement,
  platform: Platform,
  mount: WorkbenchMount = mountWorkbenchFeatures,
): Promise<Unmount> {
  document.title = "zd";

  const instrumentation = createInstrumentationClient(() => ({
    enable: platform.enableDiagnostics,
    disable: platform.disableDiagnostics,
    record: platform.recordDiagnostic,
  }));
  let diagnosticProblem: string | null = null;
  if (diagnosticsEnabled()) {
    const status = await instrumentation.enable();
    diagnosticProblem = status.problem;
    if (!status.enabled) setDiagnosticsEnabled(false);
  }
  const launchSpan = instrumentation.startSpan("workbench.launch");

  let launch;
  try {
    launch = await platform.launchRequest();
  } catch (cause) {
    await launchSpan?.end("failed");
    await instrumentation.disable();
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
  const detachDiagnostics = attachWorkbenchDiagnostics(state, instrumentation);
  const catalog = loadThemeCatalog(themeFiles.files);
  const localNotices = catalog.notices.map(({ source, problem }) => `Theme ${source}: ${problem}`);
  if (diagnosticProblem) localNotices.push(`Local diagnostics: ${diagnosticProblem}`);
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
  const runtime = { launch, platform, state, instrumentation };
  const rootCommands = attachWorkbenchCommands(host, runtime);
  const detachCommandList = mountCommandList(host);
  const detachReference = registerReference(host);
  const detachChrome = mountWindowChrome();

  let unmount: Unmount;
  try {
    unmount = await mount(host, runtime);
  } catch (cause) {
    await launchSpan?.end("failed");
    await instrumentation.disable();
    detachDiagnostics();
    rootCommands.detach();
    detachCommandList();
    detachThemeSelectionOwner();
    detachThemeState();
    theme.dispose();
    detachReference();
    detachChrome();
    detachShortcuts();
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  const detachOpenRequests = attachOpenRequests(runtime);
  await launchSpan?.end("ok");

  localNotices.push(...restoreShortcutBindings());
  localNotices.push(...(await rootCommands.ready));
  showLocalNotices(host, localNotices);

  return () => {
    detachThemeSelectionOwner();
    detachThemeState();
    theme.dispose();
    detachReference();
    detachChrome();
    detachCommandList();
    rootCommands.detach();
    detachShortcuts();
    detachOpenRequests();
    unmount();
    detachDiagnostics();
    void instrumentation.disable();
  };
}
