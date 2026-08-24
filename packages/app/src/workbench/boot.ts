import type { Platform } from "@/platform";
import { registerThemeSelectionOwner } from "@/design/appearance";
import { ThemeController, loadThemeCatalog } from "@/design/themes";
import { createInstrumentationClient } from "@/instrumentation";
import { registerReference } from "./reference";
import { attachShortcuts, registerCommandTarget } from "./shortcuts";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "./state";
import { attachWorkbenchCommands } from "./commands";
import { mountCommandList } from "./command-list";
import { restoreShortcutBindings } from "./shortcut-settings";
import { mountWindowChrome } from "./chrome";
import { registerThemeCommands } from "./theme-commands";
import { attachWorkbenchDiagnostics } from "./diagnostics";
import { diagnosticsEnabled, setDiagnosticsEnabled, setWordWrap } from "./preferences";
import { setThemePreference, themePreference } from "./preferences";
import { mountWorkbenchFeatures } from "./features";
import { attachOpenRequests } from "./open-requests";
import type { Unmount, WorkbenchMount } from "./runtime";
import { TransientCoordinator } from "./transients";
import { applyWorkbenchSettings, workbenchSettingsPreferences } from "./settings-preferences";

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
  const initialState = workbenchStateFromGrants(grants, launch);
  const state = createWorkbenchStateOwner({ ...initialState, theme: themePreference() });
  const storedSettings = workbenchSettingsPreferences();
  setWordWrap(storedSettings.reading.wordWrap);
  applyWorkbenchSettings(storedSettings, state);
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
    onChange: ({ selected, lastValid }) => {
      state.setThemeSelection(selected, lastValid);
      setThemePreference({ selected, lastValid });
      queueMicrotask(() => applyWorkbenchSettings(workbenchSettingsPreferences()));
    },
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
  const transients = new TransientCoordinator();
  const runtime = { launch, platform, state, instrumentation, transients };
  const rootCommands = attachWorkbenchCommands(host, runtime);
  const detachThemeCommands = registerThemeCommands(catalog, (selected) => {
    theme.setSelection(selected);
  });
  const detachCommandList = mountCommandList(host, transients);
  const detachReference = registerReference(host, transients);
  const detachTransientDismiss = registerCommandTarget({
    id: "workbench.transient.dismiss",
    commandId: "workbench.escape",
    priority: 2_000,
    available: () => transients.hasActive(),
    run: () => transients.dismiss(),
  });
  const detachChrome = mountWindowChrome();

  let unmount: Unmount;
  try {
    unmount = await mount(host, runtime);
  } catch (cause) {
    await launchSpan?.end("failed");
    await instrumentation.disable();
    detachDiagnostics();
    rootCommands.detach();
    detachThemeCommands();
    detachCommandList();
    detachThemeSelectionOwner();
    detachThemeState();
    theme.dispose();
    detachReference();
    detachTransientDismiss();
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
    detachTransientDismiss();
    detachChrome();
    detachCommandList();
    rootCommands.detach();
    detachThemeCommands();
    detachShortcuts();
    detachOpenRequests();
    unmount();
    detachDiagnostics();
    void instrumentation.disable();
  };
}
