import "@/design/index.css";

import {
  ChangesController,
  mountChanges,
  mountChangesDiff,
  type ChangesStatusSource,
} from "@/changes";
import type {
  GitAdapter,
  GitChangeEntry,
  GitComparison,
  GitDiff,
  GitHistoryPage,
  GitScope,
  GitStatusSnapshot,
} from "@/git";

interface ChangesPerformanceFixture {
  readonly calls: string[];
  readonly controller: ChangesController;
  readonly initialRenderMs: number;
  filter(query: string): number;
  loadMoreHistory(): Promise<number>;
  openFirstDiff(): Promise<number>;
  refreshStatus(): Promise<number>;
}

declare global {
  interface Window {
    changesPerformanceFixture: ChangesPerformanceFixture;
  }
}

const scope: GitScope = { projectId: "performance-project", worktreeId: "performance-worktree" };
const calls: string[] = [];

function change(index: number): GitChangeEntry {
  const states: readonly GitChangeEntry["state"][] = [
    "modified",
    "added",
    "deleted",
    "renamed",
    "conflicted",
    "untracked",
    "ignored",
  ];
  const state = states[index % states.length]!;
  return {
    id: `working-${index}`,
    path: `src/file-${String(index).padStart(5, "0")}.ts`,
    previousPath: state === "renamed" ? `src/old-${String(index).padStart(5, "0")}.ts` : null,
    state,
    indexState: null,
    worktreeState: state === "ignored" ? null : state === "untracked" ? null : "modified",
    submodule: false,
  };
}

const entries = Array.from({ length: 10_000 }, (_, index) => change(index));
let status: GitStatusSnapshot = {
  scope,
  availability: "available",
  entries,
  truncated: false,
  problem: null,
};
const statusListeners = new Set<(snapshot: GitStatusSnapshot | null) => void>();
const statusSource: ChangesStatusSource = {
  snapshot: () => status,
  subscribe: (listener) => {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  },
  refresh: async () => {
    calls.push("status");
    status = { ...status, entries: [...status.entries] };
    for (const listener of statusListeners) listener(status);
  },
};

function historyPage(request: Parameters<GitAdapter["history"]>[0]): GitHistoryPage {
  const offset = request.cursor === "history-50" ? 50 : 0;
  return {
    scope: request.scope,
    availability: "available",
    commits: Array.from({ length: 50 }, (_, index) => {
      const sequence = 100 - offset - index;
      const id = sequence.toString(16).padStart(40, "0");
      const parent = Math.max(0, sequence - 1)
        .toString(16)
        .padStart(40, "0");
      return {
        id,
        parentIds: sequence > 1 ? [parent] : [],
        authorName: "Performance fixture",
        authoredAt: 1_700_000_000 + sequence,
        subject: `Bounded history commit ${sequence}`,
      };
    }),
    nextCursor: offset === 0 ? "history-50" : null,
    truncated: false,
    problem: null,
  };
}

function comparison(request: Parameters<GitAdapter["compare"]>[0]): GitComparison {
  return {
    scope: request.scope,
    availability: "available",
    baseCommitId: request.baseCommitId,
    headCommitId: request.headCommitId,
    entries: [
      {
        id: "comparison-main",
        path: "src/main.ts",
        previousPath: null,
        state: "modified",
        submodule: false,
      },
    ],
    truncated: false,
    problem: null,
  };
}

function diff(request: Parameters<GitAdapter["diff"]>[0]): GitDiff {
  return {
    scope: request.scope,
    availability: "available",
    base: {
      status: "text",
      identity: `base-${request.source.changeId}`,
      path: "src/main.ts",
      revision: "a".repeat(40),
      text: "export const value = 1;\n".repeat(500),
      byteLength: 12_000,
    },
    head: {
      status: "text",
      identity: `head-${request.source.changeId}`,
      path: "src/main.ts",
      revision: "working-tree",
      text: "export const value = 2;\n".repeat(500),
      byteLength: 12_000,
    },
    problem: null,
  };
}

const git: GitAdapter = {
  status: async () => status,
  history: async (request) => {
    calls.push(`history:${request.cursor ?? "first"}`);
    return historyPage(request);
  },
  compare: async (request) => {
    calls.push("compare");
    return comparison(request);
  },
  diff: async (request) => {
    calls.push("diff");
    return diff(request);
  },
};

const fixtureHost = document.getElementById("changes-performance");
if (!fixtureHost) throw new Error("Changes performance fixture host is missing");
fixtureHost.style.display = "grid";
fixtureHost.style.gridTemplateColumns = "320px minmax(0, 1fr)";
fixtureHost.style.width = "1200px";
fixtureHost.style.height = "720px";
const changesHost = document.createElement("aside");
const diffHost = document.createElement("main");
changesHost.style.minHeight = "0";
changesHost.style.overflow = "hidden";
diffHost.style.minHeight = "0";
diffHost.style.overflow = "hidden";
fixtureHost.append(changesHost, diffHost);

const controller = new ChangesController(git, statusSource);
controller.activate(scope);
const renderStarted = performance.now();
mountChanges(changesHost, controller);
mountChangesDiff(diffHost, controller);
const initialRenderMs = performance.now() - renderStarted;

window.changesPerformanceFixture = {
  calls,
  controller,
  initialRenderMs,
  filter: (query) => {
    const started = performance.now();
    controller.setFilter(query);
    return performance.now() - started;
  },
  loadMoreHistory: async () => {
    const started = performance.now();
    await controller.loadMoreHistory();
    return performance.now() - started;
  },
  openFirstDiff: async () => {
    const started = performance.now();
    await controller.openWorkingDiff(entries[0]!.id);
    return performance.now() - started;
  },
  refreshStatus: async () => {
    const started = performance.now();
    await controller.refreshStatus();
    return performance.now() - started;
  },
};
