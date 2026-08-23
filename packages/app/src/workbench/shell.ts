import type {
  Unmount,
  WorkbenchMount,
  WorkbenchRegionMounts,
  WorkbenchRuntimeContext,
} from "./runtime";
import type { WorkbenchRegions, WorkbenchState } from "./state";

const GEOMETRY_STEP = 8;
const SPLIT_STEP = 0.02;
const FILES_SUPPRESSED_QUERY = "(max-width: 58.25rem)";
const THREADS_HIDDEN_QUERY = "(max-width: 40rem)";
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

function watchResponsiveSuppression(
  query: string,
  region: HTMLElement,
  focusFallback: () => HTMLElement,
): Unmount {
  if (typeof window.matchMedia !== "function") return () => {};

  const media = window.matchMedia(query);
  let returnFocus: HTMLElement | null = null;
  let fallback: HTMLElement | null = null;
  const reconcileFocus = () => {
    const active = document.activeElement;
    if (media.matches) {
      if (active instanceof HTMLElement && region.contains(active)) {
        returnFocus = active;
        fallback = focusFallback();
        fallback.focus({ preventScroll: true });
      }
      return;
    }

    if (returnFocus && fallback === document.activeElement && returnFocus.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
    fallback = null;
  };

  media.addEventListener("change", reconcileFocus);
  reconcileFocus();
  return () => media.removeEventListener("change", reconcileFocus);
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
  threads.setAttribute("aria-label", "Threads");
  const threadsPanel = document.createElement("div");
  threadsPanel.dataset.workbenchSlot = "threads";
  threadsPanel.append(quietState("No projects open."));
  threads.append(threadsPanel);

  const threadsResizer = separator("threads");

  const centre = document.createElement("main");
  centre.className = "zd-workbench-centre";
  centre.dataset.region = "centre";
  centre.setAttribute("aria-label", "Current content");

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
  centre.append(threadSurface, centreResizer, fileSurface);

  const filesResizer = separator("files");
  const files = document.createElement("aside");
  files.className = "zd-workbench-files";
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
    threadOwnsCentre(regions) ? threadSurface : fileSurface;
  let lastMeaningfulFocus: HTMLElement = centreFocusTarget();
  let previousPresentation = context.state.snapshot().window.presentation;
  const rememberFocus = (event: FocusEvent) => {
    if (event.target instanceof HTMLElement && shell.contains(event.target)) {
      lastMeaningfulFocus = event.target;
    }
  };
  shell.addEventListener("focusin", rememberFocus);

  const render = (state: WorkbenchState) => {
    regionState(shell, state);
    const { regions } = state;
    const filesSelected = regions.files.tab === "files";
    filesTab.setAttribute("aria-selected", String(filesSelected));
    changesTab.setAttribute("aria-selected", String(!filesSelected));
    filesTab.tabIndex = filesSelected ? 0 : -1;
    changesTab.tabIndex = filesSelected ? -1 : 0;
    filesPanel.hidden = !filesSelected;
    changesPanel.hidden = filesSelected;

    const sideBySide = regions.centre.mode === "side-by-side";
    const threadSelected = threadOwnsCentre(regions);
    threadSurface.hidden = !sideBySide && !threadSelected;
    fileSurface.hidden = !sideBySide && threadSelected;
    centreResizer.hidden = !sideBySide;

    const active = document.activeElement;
    if (
      (regions.threads.visibility === "hidden" && threads.contains(active)) ||
      (regions.files.visibility === "hidden" && files.contains(active))
    ) {
      centreFocusTarget(regions).focus({ preventScroll: true });
    }

    threads.setAttribute("aria-hidden", String(regions.threads.visibility === "hidden"));
    files.setAttribute("aria-hidden", String(regions.files.visibility === "hidden"));
    threads.inert = regions.threads.visibility === "hidden";
    files.inert = regions.files.visibility === "hidden";

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

  threadsResizer.setAttribute("aria-valuemin", "184");
  threadsResizer.setAttribute("aria-valuemax", "300");
  filesResizer.setAttribute("aria-valuemin", "220");
  filesResizer.setAttribute("aria-valuemax", "360");
  centreResizer.setAttribute("aria-valuemin", "30");
  centreResizer.setAttribute("aria-valuemax", "70");

  render(context.state.snapshot());
  const stopState = context.state.subscribe(render);

  const selectTab = (tab: "files" | "changes") =>
    updateRegions(context, (regions) => ({
      ...regions,
      files: { ...regions.files, tab },
      focus: "files",
    }));
  filesTab.addEventListener("click", () => selectTab("files"));
  changesTab.addEventListener("click", () => selectTab("changes"));

  const cleanups: Unmount[] = [
    watchResponsiveSuppression(FILES_SUPPRESSED_QUERY, files, centreFocusTarget),
    watchResponsiveSuppression(THREADS_HIDDEN_QUERY, threads, centreFocusTarget),
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
