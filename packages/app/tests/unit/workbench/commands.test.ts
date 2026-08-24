import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform, WindowPresentation } from "@/platform";
import {
  createInstrumentationClient,
  createUnavailableInstrumentationClient,
  type InstrumentationClient,
} from "@/instrumentation";
import { clearCommands, commands, dispatch, registerCommandTarget } from "@/workbench/shortcuts";
import { attachWorkbenchCommands } from "@/workbench/commands";
import { mountCommandList } from "@/workbench/command-list";
import { homeLaunch, type ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

const projects: readonly ProjectGrant[] = [
  {
    id: "project-one",
    name: "One",
    root: "/one",
    availability: "available",
    worktrees: [
      {
        id: "worktree-one",
        name: "One",
        root: "/one",
        availability: "available",
      },
    ],
  },
  {
    id: "project-two",
    name: "Two",
    root: "/two",
    availability: "available",
    worktrees: [
      {
        id: "worktree-two",
        name: "Two",
        root: "/two",
        availability: "available",
      },
    ],
  },
];

function setupPlatform(
  registration: Platform["registerGlobalSummon"] extends () => Promise<infer Result>
    ? Result
    : never = {
    supported: true,
    registered: true,
    shortcut: "CmdOrCtrl+Shift+Space",
    problem: null,
  },
) {
  let presentationChanged: ((presentation: WindowPresentation) => void) | null = null;
  const toggleQuickAccess = vi.fn(async () => "quick-access" as const);
  const hideQuickAccess = vi.fn(async () => "ordinary" as const);
  const platform = {
    kind: "browser",
    registerGlobalSummon: async () => registration,
    onWindowPresentationChanged: (handler: (presentation: WindowPresentation) => void) => {
      presentationChanged = handler;
      return () => {
        presentationChanged = null;
      };
    },
    toggleQuickAccess,
    hideQuickAccess,
  } as unknown as Platform;
  return {
    platform,
    toggleQuickAccess,
    hideQuickAccess,
    presentation: (value: WindowPresentation) => presentationChanged?.(value),
  };
}

function context(
  platform: Platform,
  instrumentation: InstrumentationClient = createUnavailableInstrumentationClient(),
) {
  const launch = homeLaunch();
  return {
    launch,
    platform,
    state: createWorkbenchStateOwner(workbenchStateFromGrants(projects, launch)),
    instrumentation,
  };
}

beforeEach(clearCommands);
afterEach(clearCommands);

describe("root workbench commands", () => {
  it("opens the command list and runs its selected production command", async () => {
    const host = document.createElement("main");
    document.body.append(host);
    const native = setupPlatform();
    const attached = attachWorkbenchCommands(host, context(native.platform));
    const openSettings = vi.fn(() => true);
    const removeSettings = registerCommandTarget({
      id: "test-settings",
      commandId: "settings.open",
      available: () => true,
      run: openSettings,
    });
    const stopList = mountCommandList(host);
    await attached.ready;

    expect(
      commands()
        .find(({ id }) => id === "command.list")
        ?.run(),
    ).toBe(true);
    const dialog = host.querySelector<HTMLElement>("[data-command-list]");
    const query = dialog?.querySelector<HTMLInputElement>("input");
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(query).toBe(document.activeElement);

    query!.value = "settings";
    query!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    query!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(openSettings).toHaveBeenCalledOnce();
    expect(host.querySelector("[data-command-list]")).toBeNull();

    stopList();
    removeSettings();
    attached.detach();
  });

  it("records successful dispatch through the one command registry", async () => {
    const record = vi.fn(async () => ({ recorded: true, problem: null }));
    const instrumentation = createInstrumentationClient(() => ({
      enable: async () => ({
        enabled: true,
        sessionId: "session-1",
        backgroundSampling: true,
        problem: null,
      }),
      disable: async () => ({
        enabled: false,
        sessionId: null,
        backgroundSampling: false,
        problem: null,
      }),
      record,
    }));
    await instrumentation.enable();
    const native = setupPlatform();
    const target = registerCommandTarget({
      id: "test-find",
      commandId: "file.find",
      available: () => true,
      run: () => true,
    });
    const attached = attachWorkbenchCommands(
      document.createElement("div"),
      context(native.platform, instrumentation),
    );
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    dispatch(
      new KeyboardEvent("keydown", {
        key: "f",
        metaKey: mac,
        ctrlKey: !mac,
        cancelable: true,
      }),
    );

    await vi.waitFor(() =>
      expect(record).toHaveBeenCalledWith({
        recordType: "event",
        operation: "command.file.find",
        outcome: "ok",
      }),
    );
    attached.detach();
    target();
  });

  it("owns every canonical application binding in one registry", async () => {
    const native = setupPlatform();
    const attached = attachWorkbenchCommands(
      document.createElement("div"),
      context(native.platform),
    );
    await attached.ready;
    const byId = new Map(commands().map((command) => [command.id, command]));

    expect(byId.get("file.find")?.chord).toEqual({ key: "f", mod: true });
    expect(byId.get("focus.toggle")?.chord).toEqual({ key: "f", mod: true, shift: true });
    expect(byId.get("centre.toggle")?.chord).toEqual({ key: "j", mod: true });
    expect(byId.get("files.filter")?.chord).toEqual({ key: "p", mod: true });
    expect(byId.get("files.toggleVisibility")?.chord).toEqual({
      key: "b",
      mod: true,
      shift: true,
    });
    expect(byId.get("projects.toggleVisibility")?.chord).toBeUndefined();
    expect(byId.get("project.previous")?.chord).toEqual({
      key: "ArrowUp",
      mod: true,
      alt: true,
    });
    expect(byId.get("project.next")?.chord).toEqual({
      key: "ArrowDown",
      mod: true,
      alt: true,
    });
    expect(byId.get("thread.create")?.chord).toEqual({ key: "n", mod: true });
    expect(byId.get("command.list")?.chord).toEqual({ key: "p", mod: true, shift: true });
    expect(byId.get("settings.open")?.chord).toEqual({ key: ",", mod: true });
    expect(byId.get("window.summon")?.chord).toEqual({ key: " ", mod: true, shift: true });
    expect(byId.get("window.summon")?.scope).toBe("global");
    expect(byId.get("workbench.escape")?.chord).toEqual({ key: "Escape" });
    for (let index = 1; index <= 9; index += 1) {
      expect(byId.get(`project.activate.${index}`)?.chord).toEqual({
        key: String(index),
        mod: true,
      });
    }
    attached.detach();
  });

  it("activates the complete project context through the root state owner", async () => {
    const native = setupPlatform();
    const runtime = context(native.platform);
    const activateProject = vi.spyOn(runtime.state, "activateProject");
    const attached = attachWorkbenchCommands(document.createElement("div"), runtime);
    await attached.ready;

    expect(
      commands()
        .find(({ id }) => id === "project.activate.2")
        ?.run(),
    ).toBe(true);
    await vi.waitFor(() => expect(runtime.state.snapshot().active.projectId).toBe("project-two"));
    expect(activateProject).toHaveBeenCalledExactlyOnceWith("project-two");
    expect(runtime.state.snapshot().active).toEqual({
      projectId: "project-two",
      worktreeId: "worktree-two",
      threadId: null,
      fileId: null,
    });
    attached.detach();
  });

  it("cycles through projects in display order and wraps at either edge", async () => {
    const native = setupPlatform();
    const runtime = context(native.platform);
    const attached = attachWorkbenchCommands(document.createElement("div"), runtime);
    await attached.ready;
    await runtime.state.activateProject("project-one");
    const byId = new Map(commands().map((command) => [command.id, command]));

    expect(byId.get("project.next")?.run()).toBe(true);
    await vi.waitFor(() => expect(runtime.state.snapshot().active.projectId).toBe("project-two"));
    expect(byId.get("project.next")?.run()).toBe(true);
    await vi.waitFor(() => expect(runtime.state.snapshot().active.projectId).toBe("project-one"));
    expect(byId.get("project.previous")?.run()).toBe(true);
    await vi.waitFor(() => expect(runtime.state.snapshot().active.projectId).toBe("project-two"));

    attached.detach();
  });

  it("routes new-thread creation to the current feature target", async () => {
    const native = setupPlatform();
    const createThread = vi.fn(() => true);
    const stopTarget = registerCommandTarget({
      id: "test-thread-create",
      commandId: "thread.create",
      available: () => true,
      run: createThread,
    });
    const attached = attachWorkbenchCommands(
      document.createElement("div"),
      context(native.platform),
    );
    await attached.ready;

    expect(
      commands()
        .find(({ id }) => id === "thread.create")
        ?.run(),
    ).toBe(true);
    expect(createThread).toHaveBeenCalledOnce();

    attached.detach();
    stopTarget();
  });

  it("keeps ordinary launch working and reports a native registration conflict", async () => {
    const native = setupPlatform({
      supported: true,
      registered: false,
      shortcut: "CmdOrCtrl+Shift+Space",
      problem: "shortcut is already registered",
    });
    const attached = attachWorkbenchCommands(
      document.createElement("div"),
      context(native.platform),
    );
    const notices = await attached.ready;
    const summon = commands().find(({ id }) => id === "window.summon")!;

    expect(notices).toEqual([expect.stringContaining("shortcut is already registered")]);
    expect(summon.available?.()).toBe(false);
    expect(commands().find(({ id }) => id === "file.find")).toBeDefined();
    attached.detach();
  });

  it("mirrors native quick-access presentation without changing work", async () => {
    const native = setupPlatform();
    const runtime = context(native.platform);
    const before = runtime.state.snapshot().active;
    const attached = attachWorkbenchCommands(document.createElement("div"), runtime);
    await attached.ready;

    native.presentation("quick-access");

    expect(runtime.state.snapshot().window.presentation).toBe("quick-access");
    expect(runtime.state.snapshot().active).toEqual(before);
    attached.detach();
  });

  it("lets one Escape run only the highest-priority available behavior", async () => {
    const native = setupPlatform();
    const runtime = context(native.platform);
    const editorEscape = vi.fn(() => true);
    const removeEditor = registerCommandTarget({
      id: "editor.escape",
      commandId: "workbench.escape",
      priority: 10,
      available: () => true,
      run: editorEscape,
    });
    const attached = attachWorkbenchCommands(document.createElement("div"), runtime);
    await attached.ready;
    runtime.state.setWindowPresentation("quick-access");

    expect(
      commands()
        .find(({ id }) => id === "workbench.escape")
        ?.run(),
    ).toBe(true);
    expect(native.hideQuickAccess).toHaveBeenCalledOnce();
    expect(editorEscape).not.toHaveBeenCalled();

    attached.detach();
    removeEditor();
  });

  it("toggles the restored project context between its current thread and file", async () => {
    const native = setupPlatform();
    const runtime = context(native.platform);
    await runtime.state.activateFile({
      projectId: "project-one",
      worktreeId: "worktree-one",
      relativePath: "README.md",
    });
    const fileId = runtime.state.snapshot().active.fileId;
    await runtime.state.addThread({
      id: "thread-focus",
      projectId: "project-one",
      worktreeId: "worktree-one",
      name: "Shell",
      order: 0,
      type: "terminal",
      agent: "shell",
      lifecycle: "idle",
      lifecycleSource: "process",
      lifecycleRevision: 1,
      attentionUnread: false,
      attentionVersion: 0,
      backingId: "terminal:thread-focus",
      backingAvailability: "ready",
      recovery: null,
      fileId,
    });
    await runtime.state.activateFile({
      projectId: "project-two",
      worktreeId: "worktree-two",
      relativePath: "notes.md",
    });
    await runtime.state.addThread({
      id: "thread-other",
      projectId: "project-two",
      worktreeId: "worktree-two",
      name: "Other",
      order: 0,
      type: "terminal",
      agent: "shell",
      lifecycle: "idle",
      lifecycleSource: "process",
      lifecycleRevision: 1,
      attentionUnread: false,
      attentionVersion: 0,
      backingId: "terminal:thread-other",
      backingAvailability: "ready",
      recovery: null,
      fileId: runtime.state.snapshot().active.fileId,
    });
    await runtime.state.activateProject("project-one");
    expect(runtime.state.snapshot().active).toMatchObject({
      projectId: "project-one",
      threadId: "thread-focus",
      fileId,
    });
    expect(runtime.state.snapshot().regions.focus).toBe("thread");

    const host = document.createElement("div");
    const file = document.createElement("button");
    file.dataset.centreSurface = "file";
    const thread = document.createElement("section");
    thread.dataset.centreSurface = "thread";
    thread.tabIndex = -1;
    host.append(file, thread);
    document.body.append(host);
    const attached = attachWorkbenchCommands(host, runtime);
    await attached.ready;

    expect(
      commands()
        .find(({ id }) => id === "centre.toggle")
        ?.run(),
    ).toBe(true);
    expect(document.activeElement).toBe(file);
    expect(runtime.state.snapshot().regions.focus).toBe("file");
    expect(runtime.state.snapshot().active).toMatchObject({
      threadId: "thread-focus",
      fileId,
    });

    expect(
      commands()
        .find(({ id }) => id === "centre.toggle")
        ?.run(),
    ).toBe(true);
    expect(document.activeElement).toBe(thread);
    expect(runtime.state.snapshot().regions.focus).toBe("thread");

    attached.detach();
  });
});
