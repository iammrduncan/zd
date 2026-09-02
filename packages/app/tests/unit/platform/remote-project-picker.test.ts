import { describe, expect, it, vi } from "vitest";

import {
  chooseRemoteProject,
  type RemoteProjectPickerSnapshot,
} from "@/platform/remote-project-picker";
import type { ProjectGrant } from "@/workbench/resources";

const first: RemoteProjectPickerSnapshot = {
  sessionId: "picker-session",
  directory: { id: "directory-parent", name: "work", path: "/srv/work" },
  parentId: "directory-up",
  directories: [{ id: "directory-zd", name: "zd" }],
  truncated: false,
};

const second: RemoteProjectPickerSnapshot = {
  sessionId: "picker-session",
  directory: { id: "directory-zd-current", name: "zd", path: "/srv/work/zd" },
  parentId: "directory-parent-new",
  directories: [{ id: "directory-docs", name: "docs" }],
  truncated: false,
};

const filtered: RemoteProjectPickerSnapshot = {
  ...first,
  directories: [{ id: "directory-zd", name: "zd" }],
};

const grant: ProjectGrant = {
  id: "project-zd",
  name: "zd",
  root: "/srv/work/zd",
  availability: "available",
  worktrees: [
    {
      id: "worktree-zd",
      name: "main",
      root: "/srv/work/zd",
      availability: "available",
    },
  ],
};

describe("remote project picker", () => {
  it("navigates with opaque handles and returns only a host-issued grant", async () => {
    let finishStart: (snapshot: RemoteProjectPickerSnapshot) => void = () => {
      throw new Error("the remote picker start resolver is unavailable");
    };
    const transport = {
      start: vi.fn(
        () =>
          new Promise<RemoteProjectPickerSnapshot>((resolve) => {
            finishStart = resolve;
          }),
      ),
      search: vi.fn(async () => filtered),
      open: vi.fn(async () => second),
      choose: vi.fn(async () => grant),
      cancel: vi.fn(async () => undefined),
    };

    const choosing = chooseRemoteProject(transport);
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = document.querySelector<HTMLDialogElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Loading remote folders");
    finishStart(first);
    await vi.waitFor(() => expect(dialog.textContent).toContain("/srv/work"));
    expect(dialog.textContent).toContain("/srv/work");
    const filter = dialog.querySelector<HTMLInputElement>("[data-remote-project-filter]")!;
    filter.value = "zd";
    filter.form!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(dialog.querySelector('[data-remote-directory="directory-zd"]')).not.toBeNull(),
    );
    dialog.querySelector<HTMLButtonElement>('[data-remote-directory="directory-zd"]')!.click();
    await vi.waitFor(() => expect(dialog.textContent).toContain("/srv/work/zd"));
    dialog.querySelector<HTMLButtonElement>("[data-remote-project-choose]")!.click();

    await expect(choosing).resolves.toEqual(grant);
    expect(transport.search).toHaveBeenCalledExactlyOnceWith({
      sessionId: "picker-session",
      query: "zd",
    });
    expect(transport.open).toHaveBeenCalledExactlyOnceWith({
      sessionId: "picker-session",
      directoryId: "directory-zd",
    });
    expect(transport.choose).toHaveBeenCalledExactlyOnceWith({
      sessionId: "picker-session",
      directoryId: "directory-zd-current",
    });
    expect(transport.cancel).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("cancels the host session and returns no grant", async () => {
    const transport = {
      start: vi.fn(async () => first),
      search: vi.fn(async () => filtered),
      open: vi.fn(async () => second),
      choose: vi.fn(async () => grant),
      cancel: vi.fn(async () => undefined),
    };

    const choosing = chooseRemoteProject(transport);
    await vi.waitFor(() =>
      expect(document.querySelector("[data-remote-project-cancel]")).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>("[data-remote-project-cancel]")!.click();

    await expect(choosing).resolves.toBeNull();
    expect(transport.cancel).toHaveBeenCalledExactlyOnceWith({ sessionId: "picker-session" });
  });
});
