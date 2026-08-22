import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform } from "@/platform";
import { mountCurrentWorkspace } from "@/miniapps/md";
import { PERSISTENT_NOTICE } from "@/miniapps/md/notice";
import { attachShortcuts, clearCommands } from "@/workbench/shortcuts";
import type { WorkbenchRuntimeContext } from "@/workbench/runtime";
import { bootWorkbench } from "@/workbench/boot";
import { homeLaunch, type FileResource, type ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

// Vision §6: "This is not a second mode — §4 is the surface, and this is what it
// does when a caret is in it." So the document surface *is* the editor: opening
// a file puts its source on screen with a caret available, not a rendered copy
// of it you have to leave to change anything.
//
// What that surface looks like is measured in a real engine. What is settled
// here is the wiring: which path is read, what happens when it cannot be, and
// where cmd+s sends the bytes.

/** Which modifier this platform means by "mod". One definition, two describes. */
const MOD = /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "metaKey" : "ctrlKey";
const project: ProjectGrant = {
  id: "project-w",
  name: "w",
  root: "/w",
  availability: "available",
  worktrees: [{ id: "worktree-w", name: "w", root: "/w", availability: "available" }],
};

function resource(path: string): FileResource {
  return {
    projectId: project.id,
    worktreeId: project.worktrees[0]!.id,
    relativePath: path.replace(/^\/w\//, ""),
  };
}

function launch(path: string | null) {
  return path === null
    ? homeLaunch()
    : {
        project,
        worktreeId: project.worktrees[0]!.id,
        relativePath: resource(path).relativePath,
        problem: null,
      };
}

function context(
  path: string | null,
  readTextFile: Platform["readTextFile"],
  writeTextFile: Platform["writeTextFile"] = async () => {},
  fileStamp: Platform["fileStamp"] = async () => null,
): WorkbenchRuntimeContext {
  const request = launch(path);
  return {
    launch: request,
    platform: {
      kind: "browser",
      launchRequest: async () => launch(path),
      onOpenRequested: () => () => {},
      pendingOpenRequest: async () => null,
      acceptOpenRequest: async () => null,
      projectGrants: async () => [project],
      chooseProject: async () => null,
      recoverProjectGrant: async () => null,
      removeProjectGrant: async () => project,
      themeConfigFiles: async () => [],
      registerGlobalSummon: async () => ({
        supported: false,
        registered: false,
        shortcut: "CmdOrCtrl+Shift+Space",
        problem: null,
      }),
      onWindowPresentationChanged: () => () => {},
      toggleQuickAccess: async () => "ordinary",
      hideQuickAccess: async () => "ordinary",
      workspaceFiles: async () => {
        throw new Error("no listing");
      },
      readTextFile,
      writeTextFile,
      fileStamp,
      onCloseRequested: () => () => {},
      closeWindow: async () => {},
      openExternal: async () => {},
    },
    state: createWorkbenchStateOwner(workbenchStateFromGrants([project], request)),
  };
}

async function mountWith(ctx: WorkbenchRuntimeContext) {
  const host = document.createElement("div");
  // In the document, not loose: the suite's keyboard listener is on the window,
  // and a keydown inside a detached host bubbles nowhere. Mounting the way the
  // app mounts is what makes a key press in these tests mean anything.
  document.body.append(host);
  const unmount = await mountCurrentWorkspace(host, ctx);
  return { host, unmount };
}

/** The document as the surface currently holds it. */
function onScreen(host: HTMLElement): string {
  return [...host.querySelectorAll(".cm-line")].map((line) => line.textContent).join("\n");
}

describe("md opens the launched document in the editor", () => {
  it("puts the file's source on screen", async () => {
    const { host } = await mountWith(context("/w/plan.md", async () => "# Plan\n\nFirst step."));

    expect(onScreen(host)).toBe("# Plan\n\nFirst step.");
  });

  it("gives the document a caret rather than a rendered copy", async () => {
    const { host } = await mountWith(context("/w/a.md", async () => "## Heading\n\n- one\n- two"));

    // The notation stays on screen — §6.1, "the source is what is on screen" —
    // which is the visible difference from the render-only path this replaces.
    expect(host.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");
    expect(onScreen(host)).toContain("## Heading");
    expect(onScreen(host)).toContain("- one");
  });

  it("focuses the editor and teaches the focus jump when a document opens", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    let connectedAtFocus = false;
    focus.mockImplementation(function (this: HTMLElement) {
      connectedAtFocus = this.isConnected;
    });
    const { host, unmount } = await mountWith(
      context("/w/a.md", async () => "# Title\n\nFirst step."),
    );
    const content = host.querySelector(".cm-content");

    // jsdom does not make contenteditable nodes active, but a browser cannot
    // focus a detached node at all. Capture connectivity at the call rather than
    // checking afterward, once mount has attached everything and hidden the bug.
    expect(focus.mock.instances).toContain(content);
    expect(connectedAtFocus).toBe(true);
    expect(host.querySelector(".md-launch-hint")?.textContent).toBe(
      "Use opt+down-arrow to shift your focus while reading",
    );
    focus.mockRestore();
    unmount();
  });

  it("withdraws the launch lesson after five seconds", async () => {
    vi.useFakeTimers();
    try {
      const { host, unmount } = await mountWith(context("/w/a.md", async () => "# Title"));

      vi.advanceTimersByTime(4_999);
      expect(host.querySelector(".md-launch-hint")).not.toBeNull();

      vi.advanceTimersByTime(1);
      expect(host.querySelector(".md-launch-hint")).toBeNull();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks the platform for exactly the launched path", async () => {
    const readTextFile = vi.fn(async () => "# ok");
    await mountWith(context("/w/docs/notes.md", readTextFile));

    expect(readTextFile).toHaveBeenCalledExactlyOnceWith(resource("/w/docs/notes.md"));
  });

  it("puts the document inside the measure column, not loose on the surface", async () => {
    const { host } = await mountWith(context("/w/a.md", async () => "# Title"));

    // The scroll container must stay empty apart from the column, or the
    // insets and centring in §5.3 stop applying to the content.
    const surface = host.querySelector(".md-surface")!;
    expect([...surface.children].map((n) => n.className)).toEqual(["md-editor"]);
  });
});

describe("md saves the launched document", () => {
  // The production keyboard path. `boot` attaches this listener in the real app
  // (§7.1 allows exactly one); these tests mount md directly, so they attach it
  // themselves rather than reach past the registry to the editor.
  let detach = () => {};
  beforeEach(() => {
    clearCommands();
    detach = attachShortcuts();
  });
  afterEach(() => detach());

  async function save(host: HTMLElement) {
    host
      .querySelector(".cm-content")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", [MOD]: true, bubbles: true, cancelable: true }),
      );

    /*
     * A save is asynchronous, and several awaits deep: it queues behind any save
     * in flight, asks the filesystem whether the file is still the one we read,
     * writes, then re-reads the stamp.
     *
     * Flushed with a macrotask rather than by counting microtask turns. The first
     * version awaited exactly two, which was right for exactly as long as the
     * chain was two deep — it broke the moment audit H1's fix made it longer, and
     * counting turns is the same brittleness as counting frames.
     */
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("refuses to write over a file that changed while it was open", async () => {
    /*
     * §6.3's hard clause: external changes are "not silently clobbered". A save
     * replaces every byte on disk, so writing over a file that is no longer the
     * one we read destroys work this program never showed anyone — the one failure
     * a writing tool must never have.
     *
     * The stamp moves between the read at mount and the read before the write,
     * which is exactly what someone else saving the file looks like from here.
     */
    const writeTextFile = vi.fn(async () => {});
    let reads = 0;
    const { host } = await mountWith(
      context(
        "/w/plan.md",
        async () => "# Plan",
        writeTextFile,
        async () => {
          reads += 1;
          return { modified: reads === 1 ? 1000 : 2000, length: 6 };
        },
      ),
    );

    await save(host);

    expect(
      writeTextFile,
      "the document was written over someone else's edit",
    ).not.toHaveBeenCalled();
  });

  it("says so and keeps the work when the write fails", async () => {
    /*
     * Audit H1's second path: a full disk, a read-only file, a directory that is
     * gone. This used to reject inside a `void (async () => …)()` with no catch —
     * the rejection was unhandled, the reader saw nothing at all, and the editor
     * reported the document as saved over work that had reached no disk anywhere.
     *
     * What is asserted here is the user-visible half: something is said. That the
     * buffer stays dirty is pinned at the editor's own boundary, in editor.test.ts.
     */
    const { host } = await mountWith(
      context(
        "/w/plan.md",
        async () => "# Plan",
        async () => {
          throw new Error("no space left on device");
        },
      ),
    );

    await save(host);

    /*
     * On the persistent notice, not the strip — audit finding M3, and this
     * assertion inverted with it on 2026-07-30. It read `.md-status` until then,
     * which is the ten-second strip: "look away for ten seconds and the only
     * evidence of a refused save is gone."
     */
    const line = host.querySelector(PERSISTENT_NOTICE);
    expect(line, "a failed save said nothing at all").not.toBeNull();
    expect(line!.textContent).toContain("Could not save");
    expect(line!.textContent, "the reason was swallowed").toContain("no space left on device");
    expect(
      host.querySelector(".md-status"),
      "a data-loss warning was put on the surface that times out",
    ).toBeNull();
  });

  it("withdraws the warning once a save actually succeeds", async () => {
    /*
     * §7.3: it "withdraws when the path reappears" — on the condition clearing,
     * never on a timer. A warning that outlived the problem would be the permanent
     * status area §7.10 forbids, arrived at from the other direction.
     */
    let failing = true;
    const { host } = await mountWith(
      context(
        "/w/plan.md",
        async () => "# Plan",
        async () => {
          if (failing) throw new Error("no space left on device");
        },
      ),
    );

    await save(host);
    expect(host.querySelector(PERSISTENT_NOTICE), "the first save did not warn").not.toBeNull();

    failing = false;
    await save(host);

    expect(host.querySelector(PERSISTENT_NOTICE)).toBeNull();
  });

  it("puts a refused save on the persistent notice too", async () => {
    // The other §6.3 loss message. Same surface, same reason: it is evidence that
    // nothing was written, and evidence that expires is not evidence.
    let reads = 0;
    const { host } = await mountWith(
      context(
        "/w/plan.md",
        async () => "# Plan",
        async () => {},
        async () => {
          reads += 1;
          return { modified: reads === 1 ? 1000 : 2000, length: 6 };
        },
      ),
    );

    await save(host);

    const line = host.querySelector(PERSISTENT_NOTICE);
    expect(line, "the refusal said nothing that lasts").not.toBeNull();
    expect(line!.textContent).toContain("changed on disk");
  });

  it("writes when the file is still the one it read", async () => {
    // The control. Without it the refusal above would also pass on a build that
    // had simply stopped saving.
    const writeTextFile = vi.fn(async () => {});
    const { host } = await mountWith(
      context(
        "/w/plan.md",
        async () => "# Plan",
        writeTextFile,
        async () => ({
          modified: 1000,
          length: 6,
        }),
      ),
    );

    await save(host);

    expect(writeTextFile).toHaveBeenCalledExactlyOnceWith(resource("/w/plan.md"), "# Plan");
  });

  it("writes the document back to the path it was opened from", async () => {
    const writeTextFile = vi.fn(async () => {});
    const { host } = await mountWith(context("/w/plan.md", async () => "# Plan", writeTextFile));

    await save(host);

    // The editor holds text and a caret and knows nothing about files; this is
    // the join, and it is the only place that knows both.
    expect(writeTextFile).toHaveBeenCalledExactlyOnceWith(resource("/w/plan.md"), "# Plan");
  });

  it("does not write anywhere when there is no path to write to", async () => {
    const writeTextFile = vi.fn(async () => {});
    const { host } = await mountWith(context(null, async () => "", writeTextFile));

    // There is no editor at all without a document, so there is nothing to
    // press the key in — but the wiring must not invent a path either.
    expect(host.querySelector(".cm-content")).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});

describe("md states read failures at the document", () => {
  it("shows a notice instead of throwing when the file cannot be read", async () => {
    const { host } = await mountWith(
      context("/w/missing.md", async () => {
        throw new Error("no such file");
      }),
    );

    const notice = host.querySelector(".md-notice");
    expect(notice?.textContent).toContain("missing.md");
    expect(notice?.textContent).toContain("no such file");
  });

  it("does not offer a caret over a document it could not read", async () => {
    // §6.3 saving writes what is on screen. A blank editable surface over a file
    // that failed to load is one cmd+s away from destroying it.
    const { host } = await mountWith(
      context("/w/missing.md", async () => {
        throw new Error("nope");
      }),
    );

    expect(host.querySelector(".md-surface")).not.toBeNull();
    expect(host.querySelector(".cm-content")).toBeNull();
  });

  it("says so plainly when there is no path at all", async () => {
    const { host } = await mountWith(
      context(null, async () => {
        throw new Error("should not be called");
      }),
    );

    expect(host.querySelector(".md-notice")?.textContent).toContain("No document open");
  });

  it("does not ask the platform to read anything when there is no path", async () => {
    const readTextFile = vi.fn(async () => "");
    await mountWith(context(null, readTextFile));

    expect(readTextFile).not.toHaveBeenCalled();
  });

  it("survives a rejection that is not an Error", async () => {
    const { host } = await mountWith(
      context("/w/a.md", async () => Promise.reject("plain string")),
    );

    expect(host.querySelector(".md-notice")?.textContent).toContain("plain string");
  });
});

describe("md mounts and unmounts cleanly", () => {
  it("removes the whole surface on unmount", async () => {
    const { host, unmount } = await mountWith(context("/w/a.md", async () => "# Title"));

    unmount();
    expect(host.children).toHaveLength(0);
  });

  it("takes the editor down with it", async () => {
    // An editor that outlives its surface goes on holding key handlers over a
    // document nobody can see.
    const { host, unmount } = await mountWith(context("/w/a.md", async () => "# Title"));

    unmount();
    expect(host.querySelector(".cm-content")).toBeNull();
  });

  it("boots through the workbench with the document already open", async () => {
    const host = document.createElement("div");
    await bootWorkbench(host, context("/w/boot.md", async () => "# Booted").platform);

    expect(onScreen(host)).toBe("# Booted");
  });
});
