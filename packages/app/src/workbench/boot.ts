import type { Platform } from "@/platform";
import { registerThemeSelectionOwner } from "@/design/appearance";
import { ThemeController, loadThemeCatalog } from "@/design/themes";
import { createInstrumentationClient } from "@/instrumentation";
import { mountProjectList, ProjectsController } from "@/projects";
import { registerReference } from "./reference";
import { attachShortcuts } from "./shortcuts";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "./state";
import { attachWorkbenchCommands } from "./commands";
import { createProjectWorkbenchAdapter } from "./projects";
import { attachWorkbenchDiagnostics, mountDiagnosticSettings } from "./diagnostics";
import { diagnosticsEnabled, setDiagnosticsEnabled } from "./preferences";
import { mountWorkbenchShell } from "./shell";
import { mountCurrentFile } from "./current-file";
import type { Unmount, WorkbenchMount } from "./runtime";

export type { WorkbenchMount } from "./runtime";

const NOTHING: Unmount = () => {};
const mountThreads: WorkbenchMount = (host, context) => {
  const stopProjects = mountProjectList(
    host,
    new ProjectsController(
      createProjectWorkbenchAdapter(context.state, context.platform, context.instrumentation),
    ),
  );
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
const mountCurrentEditor: WorkbenchMount = (host, context) =>
  mountWorkbenchShell(host, context, {
    threads: mountThreads,
    file: mountCurrentFile,
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
  const detachReference = registerReference(host);

  let unmount: Unmount;
  try {
    unmount = await mount(host, runtime);
  } catch (cause) {
    await launchSpan?.end("failed");
    await instrumentation.disable();
    detachDiagnostics();
    rootCommands.detach();
    detachThemeSelectionOwner();
    detachThemeState();
    theme.dispose();
    detachReference();
    detachShortcuts();
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  await launchSpan?.end("ok");

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
    detachDiagnostics();
    void instrumentation.disable();
  };
}
