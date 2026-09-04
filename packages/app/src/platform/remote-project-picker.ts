import "./remote-project-picker.css";

import type { ProjectGrant } from "@/workbench/resources";

export interface RemoteProjectPickerSnapshot {
  readonly sessionId: string;
  readonly directory: {
    readonly id: string;
    readonly name: string;
    readonly path: string;
  };
  readonly parentId: string | null;
  readonly directories: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly truncated: boolean;
}

export interface RemoteProjectPickerDirectoryRequest {
  readonly sessionId: string;
  readonly directoryId: string;
}

export interface RemoteProjectPickerTransport {
  start(): Promise<RemoteProjectPickerSnapshot>;
  search(request: {
    readonly sessionId: string;
    readonly query: string;
  }): Promise<RemoteProjectPickerSnapshot>;
  open(request: RemoteProjectPickerDirectoryRequest): Promise<RemoteProjectPickerSnapshot>;
  choose(request: RemoteProjectPickerDirectoryRequest): Promise<ProjectGrant>;
  cancel(request: { readonly sessionId: string }): Promise<void>;
}

let activePicker: Promise<ProjectGrant | null> | null = null;

function problemText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function runRemoteProjectPicker(
  transport: RemoteProjectPickerTransport,
): Promise<ProjectGrant | null> {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const dialog = document.createElement("dialog");
  dialog.className = "zd-remote-project-picker";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "zd-remote-project-picker-title");

  const title = document.createElement("h2");
  title.id = "zd-remote-project-picker-title";
  title.textContent = "Open remote folder";

  const description = document.createElement("p");
  description.className = "zd-remote-project-picker-description";
  description.textContent = "Choose a folder on the host running zd serve.";

  const status = document.createElement("p");
  status.className = "zd-remote-project-picker-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Loading remote folders…";

  dialog.append(title, description, status);
  document.body.append(dialog);
  dialog.showModal();

  let snapshot: RemoteProjectPickerSnapshot;
  try {
    snapshot = await transport.start();
  } catch (cause) {
    dialog.close();
    dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    throw cause;
  }
  let busy = false;
  let problem: string | null = null;

  const currentPath = document.createElement("p");
  currentPath.className = "zd-remote-project-picker-path";

  const filterForm = document.createElement("form");
  filterForm.className = "zd-remote-project-picker-filter";
  filterForm.setAttribute("role", "search");
  const filterInput = document.createElement("input");
  filterInput.type = "search";
  filterInput.name = "folder-filter";
  filterInput.maxLength = 256;
  filterInput.dataset.remoteProjectFilter = "true";
  filterInput.setAttribute("aria-label", "Filter folders by name");
  filterInput.placeholder = "Filter folders by name";
  const filterButton = document.createElement("button");
  filterButton.type = "submit";
  filterButton.textContent = "Filter";
  filterForm.append(filterInput, filterButton);

  const navigation = document.createElement("div");
  navigation.className = "zd-remote-project-picker-navigation";

  const actions = document.createElement("div");
  actions.className = "zd-remote-project-picker-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.remoteProjectCancel = "true";
  cancelButton.textContent = "Cancel";

  const chooseButton = document.createElement("button");
  chooseButton.type = "button";
  chooseButton.dataset.remoteProjectChoose = "true";
  chooseButton.textContent = "Open This Folder";

  actions.append(cancelButton, chooseButton);
  dialog.replaceChildren(title, description, currentPath, filterForm, navigation, status, actions);

  return new Promise<ProjectGrant | null>((resolve, reject) => {
    let settled = false;

    const finish = (result: ProjectGrant | null, cause?: unknown): void => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      if (cause === undefined) resolve(result);
      else reject(cause);
    };

    const render = (): void => {
      currentPath.textContent = snapshot.directory.path;
      navigation.replaceChildren();

      const parentId = snapshot.parentId;
      if (parentId !== null) {
        const parent = document.createElement("button");
        parent.type = "button";
        parent.className = "zd-remote-project-picker-parent";
        parent.disabled = busy;
        parent.textContent = "↑ Parent folder";
        parent.addEventListener("click", () => {
          void openDirectory(parentId);
        });
        navigation.append(parent);
      }

      const list = document.createElement("div");
      list.className = "zd-remote-project-picker-list";
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", `Folders in ${snapshot.directory.path}`);
      for (const directory of snapshot.directories) {
        const item = document.createElement("div");
        item.setAttribute("role", "listitem");
        const folder = document.createElement("button");
        folder.type = "button";
        folder.className = "zd-remote-project-picker-directory";
        folder.dataset.remoteDirectory = directory.id;
        folder.disabled = busy;
        folder.setAttribute("aria-label", directory.name);
        folder.textContent = directory.name;
        folder.addEventListener("click", () => {
          void openDirectory(directory.id);
        });
        item.append(folder);
        list.append(item);
      }
      if (snapshot.directories.length === 0) {
        const empty = document.createElement("p");
        empty.className = "zd-remote-project-picker-empty";
        empty.textContent =
          filterInput.value.trim().length === 0
            ? "This folder has no child folders."
            : "No folders match this filter.";
        list.append(empty);
      }
      navigation.append(list);

      status.textContent = problem ?? (busy ? "Opening remote folder…" : "");
      if (!problem && !busy && snapshot.truncated) {
        status.textContent = "This folder is large. Enter an exact folder name to find more.";
      }
      status.dataset.problem = String(problem !== null);
      filterInput.disabled = busy;
      filterButton.disabled = busy;
      cancelButton.disabled = busy;
      chooseButton.disabled = busy;
    };

    const showProblem = (cause: unknown): void => {
      busy = false;
      problem = problemText(cause);
      render();
    };

    const openDirectory = async (directoryId: string): Promise<void> => {
      if (busy || settled) return;
      busy = true;
      problem = null;
      render();
      try {
        snapshot = await transport.open({ sessionId: snapshot.sessionId, directoryId });
        filterInput.value = "";
        busy = false;
        render();
      } catch (cause) {
        showProblem(cause);
      }
    };

    const search = async (): Promise<void> => {
      if (busy || settled) return;
      busy = true;
      problem = null;
      render();
      try {
        snapshot = await transport.search({
          sessionId: snapshot.sessionId,
          query: filterInput.value,
        });
        busy = false;
        render();
      } catch (cause) {
        showProblem(cause);
      }
    };

    const choose = async (): Promise<void> => {
      if (busy || settled) return;
      busy = true;
      problem = null;
      render();
      try {
        const grant = await transport.choose({
          sessionId: snapshot.sessionId,
          directoryId: snapshot.directory.id,
        });
        finish(grant);
      } catch (cause) {
        showProblem(cause);
      }
    };

    const cancel = async (): Promise<void> => {
      if (busy || settled) return;
      busy = true;
      problem = null;
      render();
      try {
        await transport.cancel({ sessionId: snapshot.sessionId });
        finish(null);
      } catch (cause) {
        showProblem(cause);
      }
    };

    cancelButton.addEventListener("click", () => {
      void cancel();
    });
    chooseButton.addEventListener("click", () => {
      void choose();
    });
    filterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void search();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      void cancel();
    });

    render();
    chooseButton.focus();
  });
}

/** Show the one host-owned project browser and return only a host-issued grant. */
export function chooseRemoteProject(
  transport: RemoteProjectPickerTransport,
): Promise<ProjectGrant | null> {
  if (activePicker !== null) return activePicker;
  activePicker = runRemoteProjectPicker(transport).then(
    (grant) => {
      activePicker = null;
      return grant;
    },
    (cause: unknown) => {
      activePicker = null;
      throw cause;
    },
  );
  return activePicker;
}
