import "./view.css";

import type { GitChangeEntry, GitComparisonEntry, GitHistoryPage } from "@/git";

import type { ChangesController } from "./controller";
import { changePathIcon, changeStateLabel, changeStateTone } from "./labels";
import type { ChangesSnapshot } from "./types";
import { changesWindow } from "./virtualizer";

const FALLBACK_VIEWPORT_HEIGHT = 220;

type ChangeRow = GitChangeEntry | GitComparisonEntry;

interface VirtualList {
  readonly viewport: HTMLElement;
  readonly spacer: HTMLElement;
  readonly layer: HTMLElement;
  rows: readonly ChangeRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}

interface ChangesElements {
  readonly root: HTMLElement;
  readonly filter: HTMLInputElement;
  readonly refresh: HTMLButtonElement;
  readonly notice: HTMLParagraphElement;
  readonly workingCount: HTMLElement;
  readonly workingEmpty: HTMLParagraphElement;
  readonly working: VirtualList;
  readonly historyState: HTMLParagraphElement;
  readonly historyList: HTMLElement;
  readonly historyMore: HTMLButtonElement;
  readonly comparisonSection: HTMLElement;
  readonly comparisonTitle: HTMLElement;
  readonly comparisonEmpty: HTMLParagraphElement;
  readonly comparison: VirtualList;
}

function actionButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zd-changes-action";
  button.textContent = label;
  return button;
}

function sectionHeading(label: string): { heading: HTMLHeadingElement; count: HTMLElement } {
  const heading = document.createElement("h3");
  heading.className = "zd-changes-section-heading";
  const text = document.createElement("span");
  text.textContent = label;
  const count = document.createElement("span");
  count.className = "zd-changes-count";
  heading.append(text, count);
  return { heading, count };
}

function virtualList(label: string, name: string): VirtualList {
  const viewport = document.createElement("div");
  viewport.className = "zd-changes-viewport";
  viewport.dataset.changesViewport = name;
  viewport.setAttribute("role", "list");
  viewport.setAttribute("aria-label", label);
  const spacer = document.createElement("div");
  spacer.className = "zd-changes-spacer";
  const layer = document.createElement("div");
  layer.className = "zd-changes-layer";
  spacer.append(layer);
  viewport.append(spacer);
  return { viewport, spacer, layer, rows: [], selectedId: null, onOpen: () => {} };
}

function elements(): ChangesElements {
  const root = document.createElement("section");
  root.className = "zd-changes";
  root.setAttribute("aria-label", "Changes");

  const toolbar = document.createElement("div");
  toolbar.className = "zd-changes-toolbar";
  const filter = document.createElement("input");
  filter.type = "search";
  filter.className = "zd-changes-filter";
  filter.placeholder = "Filter changes";
  filter.autocomplete = "off";
  filter.spellcheck = false;
  filter.setAttribute("aria-label", "Filter changes");
  const refresh = actionButton("Refresh");
  refresh.setAttribute("aria-label", "Refresh Git status");
  toolbar.append(filter, refresh);

  const notice = document.createElement("p");
  notice.className = "zd-changes-notice";
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");

  const workingSection = document.createElement("section");
  workingSection.className = "zd-changes-section zd-changes-working";
  const workingHeading = sectionHeading("WORKING CHANGES");
  const workingEmpty = document.createElement("p");
  workingEmpty.className = "zd-changes-empty";
  const working = virtualList("Working changes", "working");
  workingSection.append(workingHeading.heading, workingEmpty, working.viewport);

  const historySection = document.createElement("section");
  historySection.className = "zd-changes-section zd-changes-history";
  const historyHeading = sectionHeading("HISTORY");
  const historyState = document.createElement("p");
  historyState.className = "zd-changes-empty";
  const historyList = document.createElement("div");
  historyList.className = "zd-changes-history-list";
  historyList.setAttribute("role", "list");
  historyList.setAttribute("aria-label", "Commit history");
  const historyMore = actionButton("Load more");
  historyMore.dataset.loadMoreHistory = "";
  historySection.append(historyHeading.heading, historyState, historyList, historyMore);

  const comparisonSection = document.createElement("section");
  comparisonSection.className = "zd-changes-section zd-changes-comparison";
  const comparisonHeading = sectionHeading("COMPARISON");
  const comparisonEmpty = document.createElement("p");
  comparisonEmpty.className = "zd-changes-empty";
  const comparison = virtualList("Comparison changes", "comparison");
  comparisonSection.append(comparisonHeading.heading, comparisonEmpty, comparison.viewport);

  root.append(toolbar, notice, workingSection, historySection, comparisonSection);
  return {
    root,
    filter,
    refresh,
    notice,
    workingCount: workingHeading.count,
    workingEmpty,
    working,
    historyState,
    historyList,
    historyMore,
    comparisonSection,
    comparisonTitle: comparisonHeading.count,
    comparisonEmpty,
    comparison,
  };
}

function rowMatches(row: ChangeRow, query: string): boolean {
  if (!query) return true;
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const searchable = `${row.path} ${row.previousPath ?? ""} ${row.state}`.toLocaleLowerCase();
  return terms.every((term) => searchable.includes(term));
}

function renderVirtualList(list: VirtualList): void {
  const window = changesWindow(
    list.rows.length,
    list.viewport.scrollTop,
    list.viewport.clientHeight || FALLBACK_VIEWPORT_HEIGHT,
  );
  list.spacer.style.blockSize = `${window.totalHeight}px`;
  list.layer.style.transform = `translateY(${window.offset}px)`;
  const fragment = document.createDocumentFragment();
  for (let index = window.start; index < window.end; index += 1) {
    const row = list.rows[index];
    if (!row) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zd-changes-row";
    if (list.viewport.dataset.changesViewport === "working") button.dataset.changeId = row.id;
    else button.dataset.comparisonChangeId = row.id;
    button.dataset.changeState = changeStateTone(row.state);
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-current", String(row.id === list.selectedId));
    button.setAttribute("aria-label", `${row.path}, ${changeStateLabel(row.state)}`);
    const icon = document.createElement("span");
    icon.className = "zd-changes-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = changePathIcon(row.path);
    const path = document.createElement("span");
    path.className = "zd-changes-path";
    path.textContent = row.previousPath ? `${row.previousPath} → ${row.path}` : row.path;
    const state = document.createElement("span");
    state.className = "zd-changes-state";
    state.textContent = changeStateLabel(row.state);
    button.append(icon, path, state);
    button.addEventListener("click", () => list.onOpen(row.id));
    fragment.append(button);
  }
  list.layer.replaceChildren(fragment);
}

function availabilityText(snapshot: ChangesSnapshot): string {
  if (!snapshot.scope) return "Choose an available project to inspect changes.";
  if (snapshot.problem) return snapshot.problem;
  switch (snapshot.status?.availability) {
    case "available":
      return snapshot.status.truncated ? "Git status reached its bounded entry limit." : "";
    case "non-repository":
      return "This project is not a Git repository.";
    case "denied":
      return "Git inspection was denied for this project.";
    case "unavailable":
      return snapshot.status.problem ?? "Git inspection is unavailable.";
    default:
      return "Waiting for Git status.";
  }
}

function historyState(history: GitHistoryPage | null, loading: boolean): string {
  if (loading && !history) return "Loading history…";
  if (!history) return "History has not loaded.";
  if (history.availability === "non-repository") return "History requires a Git repository.";
  if (history.availability !== "available") return history.problem ?? "History is unavailable.";
  if (history.commits.length === 0) return "No commits found.";
  return "";
}

function shortRevision(revision: string): string {
  return revision.length > 12 ? revision.slice(0, 8) : revision;
}

function renderHistory(
  ui: ChangesElements,
  snapshot: ChangesSnapshot,
  controller: ChangesController,
) {
  ui.historyState.textContent = historyState(snapshot.history, snapshot.historyLoading);
  ui.historyState.hidden = ui.historyState.textContent.length === 0;
  const fragment = document.createDocumentFragment();
  for (const commit of snapshot.history?.commits ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zd-changes-commit";
    button.dataset.commitId = commit.id;
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-pressed", String(snapshot.selectedCommitIds.includes(commit.id)));
    button.setAttribute("aria-label", `${commit.subject}, commit ${shortRevision(commit.id)}`);
    const subject = document.createElement("span");
    subject.className = "zd-changes-commit-subject";
    subject.textContent = commit.subject;
    const detail = document.createElement("span");
    detail.className = "zd-changes-commit-detail";
    detail.textContent = `${shortRevision(commit.id)} · ${commit.authorName}`;
    button.append(subject, detail);
    button.addEventListener("click", () => void controller.selectCommit(commit.id));
    fragment.append(button);
  }
  ui.historyList.replaceChildren(fragment);
  ui.historyMore.hidden = !snapshot.history?.nextCursor;
  ui.historyMore.disabled = snapshot.historyLoading;
}

function render(
  ui: ChangesElements,
  snapshot: ChangesSnapshot,
  controller: ChangesController,
): void {
  if (ui.filter.value !== snapshot.filter) ui.filter.value = snapshot.filter;
  ui.refresh.disabled = !snapshot.scope;
  ui.notice.textContent = availabilityText(snapshot);
  ui.notice.hidden = ui.notice.textContent.length === 0;

  const workingRows =
    snapshot.status?.availability === "available"
      ? snapshot.status.entries.filter((row) => rowMatches(row, snapshot.filter))
      : [];
  ui.working.rows = workingRows;
  ui.working.selectedId = snapshot.selectedChangeId;
  ui.working.onOpen = (id) => void controller.openWorkingDiff(id);
  ui.workingCount.textContent = `${workingRows.length}`;
  ui.workingEmpty.textContent =
    snapshot.status?.availability === "available" && snapshot.status.entries.length === 0
      ? "No uncommitted changes."
      : snapshot.status?.availability === "available" && workingRows.length === 0
        ? "No changes match this filter."
        : "";
  ui.workingEmpty.hidden = ui.workingEmpty.textContent.length === 0;
  ui.working.viewport.hidden = workingRows.length === 0;
  renderVirtualList(ui.working);

  renderHistory(ui, snapshot, controller);

  const comparisonRows =
    snapshot.comparison?.availability === "available"
      ? snapshot.comparison.entries.filter((row) => rowMatches(row, snapshot.filter))
      : [];
  const showComparison =
    snapshot.selectedCommitIds.length > 0 ||
    snapshot.comparisonLoading ||
    snapshot.comparison !== null;
  ui.comparisonSection.hidden = !showComparison;
  ui.comparisonTitle.textContent =
    snapshot.selectedCommitIds.length === 2
      ? snapshot.selectedCommitIds.map(shortRevision).join(" ↔ ")
      : `${snapshot.selectedCommitIds.length}/2 selected`;
  ui.comparison.rows = comparisonRows;
  ui.comparison.selectedId = snapshot.selectedChangeId;
  ui.comparison.onOpen = (id) => void controller.openComparisonDiff(id);
  ui.comparisonEmpty.textContent = snapshot.comparisonLoading
    ? "Comparing commits…"
    : snapshot.selectedCommitIds.length === 1
      ? "Select one more commit to compare."
      : snapshot.comparison?.availability === "available" && comparisonRows.length === 0
        ? "No comparison changes match."
        : (snapshot.comparison?.problem ?? "");
  ui.comparisonEmpty.hidden = ui.comparisonEmpty.textContent.length === 0;
  ui.comparison.viewport.hidden = comparisonRows.length === 0;
  renderVirtualList(ui.comparison);
}

/** Mount the persistent, read-only Git navigation panel. */
export function mountChanges(host: HTMLElement, controller: ChangesController): () => void {
  const ui = elements();
  host.replaceChildren(ui.root);
  const rerender = () => render(ui, controller.snapshot(), controller);
  const onFilter = () => controller.setFilter(ui.filter.value);
  const onRefresh = () => void controller.refreshStatus();
  const onLoadMore = () => void controller.loadMoreHistory();
  const renderWorkingWindow = () => renderVirtualList(ui.working);
  const renderComparisonWindow = () => renderVirtualList(ui.comparison);
  ui.filter.addEventListener("input", onFilter);
  ui.refresh.addEventListener("click", onRefresh);
  ui.historyMore.addEventListener("click", onLoadMore);
  ui.working.viewport.addEventListener("scroll", renderWorkingWindow);
  ui.comparison.viewport.addEventListener("scroll", renderComparisonWindow);
  const stop = controller.subscribe(rerender);
  rerender();
  void controller.loadHistory();

  return () => {
    stop();
    ui.filter.removeEventListener("input", onFilter);
    ui.refresh.removeEventListener("click", onRefresh);
    ui.historyMore.removeEventListener("click", onLoadMore);
    ui.working.viewport.removeEventListener("scroll", renderWorkingWindow);
    ui.comparison.viewport.removeEventListener("scroll", renderComparisonWindow);
    ui.root.remove();
  };
}
