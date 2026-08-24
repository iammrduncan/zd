import type {
  Unmount,
  WorkbenchMount,
  WorkbenchRegionMounts,
  WorkbenchRuntimeContext,
} from "./runtime";
import type { WorkbenchRegions, WorkbenchState } from "./state";
import { registerCommandTarget } from "./shortcuts";
import { mountResponsiveRegions } from "./responsive";

const GEOMETRY_STEP = 8;
const SPLIT_STEP = 0.02;
const THREADS_MIN_WIDTH = 184;
const THREADS_MAX_WIDTH = 300;
const FILES_MIN_WIDTH = 220;
const FILES_MAX_WIDTH = 360;
const CENTRE_MIN_WIDTH = 528;
const NAVIGATION_DIVIDERS_WIDTH = 2;
const NOTHING: Unmount = () => {};

function regionMounts(mounts: WorkbenchMount | WorkbenchRegionMounts): WorkbenchRegionMounts {
  return typeof mounts === "function" ? { file: mounts } : mounts;
}

async function mountRegions(
  context: WorkbenchRuntimeContext,
  regions: readonly [HTMLElement, WorkbenchMount | undefined][],
): Promise<Unmount> {
  const settled = await Promise.allSettled(
    regions.map(async ([host, mount]) => {
      if (!mount) return NOTHING;
      host.replaceChildren();
      return await mount(host, context);
    }),
  );
  const mounted = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failed) {
    for (const unmount of [...mounted].reverse()) unmount();
    throw failed.reason;
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    for (const unmount of [...mounted].reverse()) unmount();
  };
}

function quietState(text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "zd-region-empty";
  element.textContent = text;
  return element;
}

function separator(name: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "zd-workbench-separator";
  element.dataset.resizer = name;
  element.setAttribute("role", "separator");
  element.setAttribute("aria-label", `Resize ${name}`);
  element.setAttribute("aria-orientation", "vertical");
  element.tabIndex = 0;
  return element;
}

function updateRegions(
  context: WorkbenchRuntimeContext,
  change: (regions: WorkbenchRegions) => WorkbenchRegions,
): void {
  context.state.updateRegions(change(context.state.snapshot().regions));
}

function onArrowResize(element: HTMLElement, resize: (direction: -1 | 1) => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resize(event.key === "ArrowLeft" ? -1 : 1);
  };
  element.addEventListener("keydown", onKeyDown);
  return () => element.removeEventListener("keydown", onKeyDown);
}

function onPointerResize(
  element: HTMLElement,
  current: () => number,
  resize: (start: number, delta: number) => void,
): () => void {
  let stopDrag: Unmount = () => {};
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopDrag();

    const startX = event.clientX;
    const start = current();
    const onMove = (move: PointerEvent) => resize(start, move.clientX - startX);
    const onUp = () => stopDrag();
    stopDrag = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stopDrag = () => {};
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  element.addEventListener("pointerdown", onPointerDown);
  return () => {
    stopDrag();
    element.removeEventListener("pointerdown", onPointerDown);
  };
}

export function fitNavigationWidths(
  shellWidth: number,
  requestedThreads: number,
  requestedFiles: number,
): { readonly threads: number; readonly files: number } {
  const threads = Math.min(THREADS_MAX_WIDTH, Math.max(THREADS_MIN_WIDTH, requestedThreads));
  const files = Math.min(FILES_MAX_WIDTH, Math.max(FILES_MIN_WIDTH, requestedFiles));
  const requestedTotal = threads + files;
  const available = Math.max(0, shellWidth - CENTRE_MIN_WIDTH - NAVIGATION_DIVIDERS_WIDTH);
  if (available >= requestedTotal) return { threads, files };

  const minimumTotal = THREADS_MIN_WIDTH + FILES_MIN_WIDTH;
  if (available <= minimumTotal) {
    return { threads: THREADS_MIN_WIDTH, files: FILES_MIN_WIDTH };
  }

  const threadsSlack = threads - THREADS_MIN_WIDTH;
  const filesSlack = files - FILES_MIN_WIDTH;
  const slack = threadsSlack + filesSlack;
  if (slack === 0) return { threads, files };

  const reduction = requestedTotal - available;
  const threadsReduction = reduction * (threadsSlack / slack);
  return {
    threads: threads - threadsReduction,
    files: files - (reduction - threadsReduction),
  };
}

function regionState(shell: HTMLElement, state: WorkbenchState): void {
  const { regions } = state;
  shell.dataset.threadsVisibility = regions.threads.visibility;
  shell.dataset.filesVisibility = regions.files.visibility;
  shell.dataset.centreMode = regions.centre.mode;
  shell.dataset.focusRegion = regions.focus;
  shell.dataset.windowPresentation = state.window.presentation;
  shell.style.setProperty("--workbench-threads-width", `${regions.threads.width}px`);
  shell.style.setProperty("--workbench-files-width", `${regions.files.width}px`);
  const fitted =
    regions.threads.visibility === "full" && regions.files.visibility === "visible"
      ? fitNavigationWidths(shell.clientWidth, regions.threads.width, regions.files.width)
      : { threads: regions.threads.width, files: regions.files.width };
  shell.style.setProperty("--workbench-threads-fitted-width", `${fitted.threads}px`);
  shell.style.setProperty("--workbench-files-fitted-width", `${fitted.files}px`);
  const splitPercent = Math.round(regions.centre.split * 10_000) / 100;
  shell.style.setProperty("--workbench-centre-split", `${splitPercent}%`);
}

/** Mount the persistent workbench regions around the current content owner. */
export async function mountWorkbenchShell(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  featureMounts: WorkbenchMount | WorkbenchRegionMounts,
): Promise<Unmount> {
  const mounts = regionMounts(featureMounts);
  const shell = document.createElement("div");
  shell.className = "zd-workbench";

  const threads = document.createElement("aside");
  threads.className = "zd-workbench-threads";
  threads.dataset.region = "threads";
  threads.setAttribute("aria-label", "Projects");
  const threadsPanel = document.createElement("div");
  threadsPanel.dataset.workbenchSlot = "threads";
  threadsPanel.append(quietState("No projects open."));
  threads.append(threadsPanel);

  const threadsResizer = separator("threads");

  const centre = document.createElement("main");
  centre.className = "zd-workbench-centre";
  centre.dataset.region = "centre";
  centre.setAttribute("aria-label", "Current content");

  const homeSurface = document.createElement("section");
  homeSurface.className = "zd-centre-surface zd-home-surface";
  homeSurface.dataset.centreSurface = "home";
  homeSurface.dataset.workbenchSlot = "home";
  homeSurface.setAttribute("aria-label", "Open a project or workspace");
  homeSurface.tabIndex = -1;
  homeSurface.append(quietState("Choose a project to begin."));

  const threadSurface = document.createElement("section");
  threadSurface.className = "zd-centre-surface zd-thread-surface";
  threadSurface.dataset.centreSurface = "thread";
  threadSurface.dataset.workbenchSlot = "thread";
  threadSurface.setAttribute("aria-label", "Current thread");
  threadSurface.tabIndex = -1;
  threadSurface.append(quietState("No thread selected."));

  const centreResizer = separator("centre");
  const fileSurface = document.createElement("section");
  fileSurface.className = "zd-centre-surface zd-file-surface";
  fileSurface.dataset.centreSurface = "file";
  fileSurface.dataset.workbenchSlot = "file";
  fileSurface.setAttribute("aria-label", "Current file");
  fileSurface.tabIndex = -1;
  centre.append(homeSurface, threadSurface, centreResizer, fileSurface);

  const filesResizer = separator("files");
  const files = document.createElement("aside");
  files.className = "zd-workbench-files";
  files.id = "zd-workbench-files-region";
  files.dataset.region = "files";
  files.setAttribute("aria-label", "Files and Changes");

  const tabs = document.createElement("div");
  tabs.className = "zd-files-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Project navigation");

  const filesTab = document.createElement("button");
  filesTab.type = "button";
  filesTab.id = "zd-files-tab";
  filesTab.className = "zd-files-tab";
  filesTab.setAttribute("role", "tab");
  filesTab.setAttribute("aria-controls", "zd-files-panel");
  filesTab.textContent = "FILES";

  const changesTab = document.createElement("button");
  changesTab.type = "button";
  changesTab.id = "zd-changes-tab";
  changesTab.className = "zd-files-tab";
  changesTab.setAttribute("role", "tab");
  changesTab.setAttribute("aria-controls", "zd-changes-panel");
  changesTab.textContent = "CHANGES";
  tabs.append(filesTab, changesTab);

  const filesPanel = document.createElement("div");
  filesPanel.id = "zd-files-panel";
  filesPanel.className = "zd-files-panel";
  filesPanel.dataset.workbenchSlot = "files";
  filesPanel.setAttribute("role", "tabpanel");
  filesPanel.setAttribute("aria-labelledby", filesTab.id);
  filesPanel.append(quietState("No project open."));

  const changesPanel = document.createElement("div");
  changesPanel.id = "zd-changes-panel";
  changesPanel.className = "zd-files-panel";
  changesPanel.dataset.workbenchSlot = "changes";
  changesPanel.setAttribute("role", "tabpanel");
  changesPanel.setAttribute("aria-labelledby", changesTab.id);
  changesPanel.append(quietState("No Git context."));
  files.append(tabs, filesPanel, changesPanel);

  shell.append(threads, threadsResizer, centre, filesResizer, files);
  host.replaceChildren(shell);

  const threadOwnsCentre = (regions: WorkbenchRegions) =>
    regions.focus === "thread" || regions.focus === "threads";
  const centreFocusTarget = (regions = context.state.snapshot().regions) =>
    context.state.snapshot().projects.length === 0
      ? homeSurface
      : threadOwnsCentre(regions)
        ? threadSurface
        : fileSurface;
  let lastMeaningfulFocus: HTMLElement = centreFocusTarget();
  let lastProjectsVisibility =
    context.state.snapshot().regions.threads.visibility === "hidden"
      ? "full"
      : context.state.snapshot().regions.threads.visibility;
  let previousPresentation = context.state.snapshot().window.presentation;
  const rememberFocus = (event: FocusEvent) => {
    if (event.target instanceof HTMLElement && shell.contains(event.target)) {
      lastMeaningfulFocus = event.target;
    }
  };
  shell.addEventListener("focusin", rememberFocus);

  const responsive = mountResponsiveRegions(shell, threads, files, filesTab, centreFocusTarget);

  const render = (state: WorkbenchState) => {
    regionState(shell, state);
    const { regions } = state;
    const homeSelected = state.projects.length === 0;
    shell.dataset.home = String(homeSelected);
    const filesSelected = regions.files.tab === "files";
    if (regions.threads.visibility !== "hidden") {
      lastProjectsVisibility = regions.threads.visibility;
    }
    filesTab.setAttribute("aria-selected", String(filesSelected));
    changesTab.setAttribute("aria-selected", String(!filesSelected));
    filesTab.tabIndex = filesSelected ? 0 : -1;
    changesTab.tabIndex = filesSelected ? -1 : 0;
    filesPanel.hidden = !filesSelected;
    changesPanel.hidden = filesSelected;

    const sideBySide = regions.centre.mode === "side-by-side";
    const threadSelected = threadOwnsCentre(regions);
    homeSurface.hidden = !homeSelected;
    threadSurface.hidden = homeSelected || (!sideBySide && !threadSelected);
    fileSurface.hidden = homeSelected || (!sideBySide && threadSelected);
    centreResizer.hidden = homeSelected || !sideBySide;

    const active = document.activeElement;
    if (
      (regions.threads.visibility === "hidden" && threads.contains(active)) ||
      (regions.files.visibility === "hidden" && files.contains(active))
    ) {
      centreFocusTarget(regions).focus({ preventScroll: true });
    }

    responsive.syncVisibility(
      regions.threads.visibility === "hidden",
      regions.files.visibility === "hidden",
    );

    threadsResizer.setAttribute("aria-valuenow", String(regions.threads.width));
    filesResizer.setAttribute("aria-valuenow", String(regions.files.width));
    centreResizer.setAttribute("aria-valuenow", String(Math.round(regions.centre.split * 100)));

    if (state.window.presentation === "quick-access" && previousPresentation !== "quick-access") {
      queueMicrotask(() => {
        const target =
          lastMeaningfulFocus.isConnected && !lastMeaningfulFocus.closest("[inert]")
            ? lastMeaningfulFocus
            : centreFocusTarget(regions);
        target.focus({ preventScroll: true });
      });
    }
    previousPresentation = state.window.presentation;
  };

  threadsResizer.setAttribute("aria-valuemin", String(THREADS_MIN_WIDTH));
  threadsResizer.setAttribute("aria-valuemax", String(THREADS_MAX_WIDTH));
  filesResizer.setAttribute("aria-valuemin", String(FILES_MIN_WIDTH));
  filesResizer.setAttribute("aria-valuemax", String(FILES_MAX_WIDTH));
  centreResizer.setAttribute("aria-valuemin", "30");
  centreResizer.setAttribute("aria-valuemax", "70");

  render(context.state.snapshot());
  const stopState = context.state.subscribe(render);
  const geometryObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => regionState(shell, context.state.snapshot()));
  geometryObserver?.observe(shell);

  const selectTab = (tab: "files" | "changes") =>
    updateRegions(context, (regions) => ({
      ...regions,
      files: { ...regions.files, tab },
      focus: "files",
    }));
  filesTab.addEventListener("click", () => selectTab("files"));
  changesTab.addEventListener("click", () => selectTab("changes"));
  const stopFilesVisibility = registerCommandTarget({
    id: "workbench.files.toggle-visibility",
    commandId: "files.toggleVisibility",
    priority: 100,
    available: () => true,
    run: () => {
      if (responsive.filesSuppressed()) return responsive.toggleFiles();
      updateRegions(context, (regions) => ({
        ...regions,
        files: {
          ...regions.files,
          visibility: regions.files.visibility === "visible" ? "hidden" : "visible",
        },
      }));
      return true;
    },
  });
  const stopResponsiveFilesDismiss = registerCommandTarget({
    id: "workbench.files.dismiss-responsive",
    commandId: "workbench.escape",
    priority: 250,
    available: responsive.filesOpen,
    run: responsive.closeFiles,
  });
  const stopProjectsVisibility = registerCommandTarget({
    id: "workbench.projects.toggle-visibility",
    commandId: "projects.toggleVisibility",
    priority: 100,
    available: () => true,
    run: () => {
      updateRegions(context, (regions) => ({
        ...regions,
        threads: {
          ...regions.threads,
          visibility: regions.threads.visibility === "hidden" ? lastProjectsVisibility : "hidden",
        },
      }));
      return true;
    },
  });

  const cleanups: Unmount[] = [
    stopProjectsVisibility,
    stopFilesVisibility,
    stopResponsiveFilesDismiss,
    responsive.dispose,
    () => geometryObserver?.disconnect(),
    onArrowResize(threadsResizer, (direction) =>
      updateRegions(context, (regions) => ({
        ...regions,
        threads: { ...regions.threads, width: regions.threads.width + direction * GEOMETRY_STEP },
      })),
    ),
    onArrowResize(filesResizer, (direction) =>
      updateRegions(context, (regions) => ({
        ...regions,
        files: { ...regions.files, width: regions.files.width - direction * GEOMETRY_STEP },
      })),
    ),
    onArrowResize(centreResizer, (direction) =>
      updateRegions(context, (regions) => ({
        ...regions,
        centre: { ...regions.centre, split: regions.centre.split + direction * SPLIT_STEP },
      })),
    ),
    onPointerResize(
      threadsResizer,
      () => context.state.snapshot().regions.threads.width,
      (start, delta) =>
        updateRegions(context, (regions) => ({
          ...regions,
          threads: { ...regions.threads, width: start + delta },
        })),
    ),
    onPointerResize(
      filesResizer,
      () => context.state.snapshot().regions.files.width,
      (start, delta) =>
        updateRegions(context, (regions) => ({
          ...regions,
          files: { ...regions.files, width: start - delta },
        })),
    ),
    onPointerResize(
      centreResizer,
      () => context.state.snapshot().regions.centre.split,
      (start, delta) => {
        const width = Math.max(1, centre.getBoundingClientRect().width);
        updateRegions(context, (regions) => ({
          ...regions,
          centre: { ...regions.centre, split: start + delta / width },
        }));
      },
    ),
  ];

  let unmountRegions: Unmount;
  try {
    unmountRegions = await mountRegions(context, [
      [homeSurface, mounts.home],
      [threadsPanel, mounts.threads],
      [threadSurface, mounts.thread],
      [fileSurface, mounts.file],
      [filesPanel, mounts.files],
      [changesPanel, mounts.changes],
    ]);
  } catch (cause) {
    shell.removeEventListener("focusin", rememberFocus);
    stopState();
    cleanups.forEach((cleanup) => cleanup());
    shell.remove();
    throw cause;
  }

  let mounted = true;
  return () => {
    if (!mounted) return;
    mounted = false;
    shell.removeEventListener("focusin", rememberFocus);
    stopState();
    cleanups.forEach((cleanup) => cleanup());
    unmountRegions();
    shell.remove();
  };
}
