import type { ThreadsController } from "./controller";
import type { ThreadAgent, ThreadWorktreeContext } from "./types";
import { performThreadAction } from "./view-actions";

export interface ProjectThreadsOptions {
  readonly projectName?: string;
  readonly workspaces?: readonly ThreadWorktreeContext[];
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "zd-thread-create-field";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function input(name: string, required = false): HTMLInputElement {
  const control = document.createElement("input");
  control.name = name;
  control.required = required;
  control.autocomplete = "off";
  return control;
}

export function createThreadCreator(
  controller: ThreadsController,
  projectId: string,
  status: HTMLElement,
  options: ProjectThreadsOptions,
): HTMLElement | null {
  if (!options.workspaces) return null;
  const available = options.workspaces.filter(({ availability }) => availability === "available");
  const container = document.createElement("div");
  container.className = "zd-thread-create-owner";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "zd-thread-create-toggle";
  toggle.dataset.threadCreateToggle = projectId;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `Create thread in ${options.projectName ?? projectId}`);
  toggle.textContent = "+ Thread";
  toggle.disabled = available.length === 0;

  const form = document.createElement("form");
  form.className = "zd-thread-create";
  form.dataset.threadCreate = projectId;
  form.hidden = true;
  const threadName = input("thread-name", true);
  threadName.placeholder = "Thread name";
  const agent = document.createElement("select");
  agent.name = "thread-agent";
  const agents: Array<[ThreadAgent, string]> = [
    ["shell", "Terminal"],
    ["codex", "Codex"],
    ["claude-code", "Claude Code"],
    ["opencode", "OpenCode"],
  ];
  for (const [value, label] of agents) agent.add(new Option(label, value));

  const workspace = document.createElement("select");
  workspace.name = "thread-workspace";
  for (const worktree of available) {
    const label = worktree.kind === "project-root" ? "Project root" : `Worktree: ${worktree.label}`;
    workspace.add(new Option(label, worktree.id));
  }
  workspace.add(new Option("New worktree…", "new-worktree"));

  const worktreeFields = document.createElement("div");
  worktreeFields.className = "zd-thread-worktree-fields";
  worktreeFields.hidden = true;
  const worktreeName = input("worktree-name", true);
  worktreeName.placeholder = "worktree-name";
  const worktreeBranch = input("worktree-branch", true);
  worktreeBranch.placeholder = "feature/branch";
  const baseRevision = input("base-revision");
  baseRevision.placeholder = "Base revision (optional)";
  worktreeFields.append(
    field("Worktree", worktreeName),
    field("Branch", worktreeBranch),
    field("Base", baseRevision),
  );

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Create";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const actions = document.createElement("div");
  actions.className = "zd-thread-create-actions";
  actions.append(submit, cancel);
  form.append(
    field("Name", threadName),
    field("Type", agent),
    field("Workspace", workspace),
    worktreeFields,
    actions,
  );
  container.append(toggle, form);

  const setOpen = (open: boolean) => {
    form.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) threadName.focus();
  };
  toggle.addEventListener("click", () => setOpen(form.hidden));
  cancel.addEventListener("click", () => setOpen(false));
  const updateWorktreeFields = () => {
    const enabled = workspace.value === "new-worktree";
    worktreeFields.hidden = !enabled;
    worktreeName.disabled = !enabled;
    worktreeBranch.disabled = !enabled;
    baseRevision.disabled = !enabled;
  };
  workspace.addEventListener("change", updateWorktreeFields);
  updateWorktreeFields();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const selected = available.find(({ id }) => id === workspace.value);
    const request = {
      name: threadName.value,
      type: { kind: "terminal" as const, agent: agent.value as ThreadAgent },
      workspace:
        workspace.value === "new-worktree"
          ? {
              kind: "new-worktree" as const,
              projectId,
              name: worktreeName.value,
              branch: worktreeBranch.value,
              baseRevision: baseRevision.value.trim() || null,
            }
          : {
              kind:
                selected?.kind === "project-root"
                  ? ("project-root" as const)
                  : ("existing-worktree" as const),
              projectId,
              worktreeId: workspace.value,
            },
    };
    submit.disabled = true;
    void performThreadAction(status, () => controller.createThread(request)).then((result) => {
      submit.disabled = false;
      if (result?.status === "committed") setOpen(false);
    });
  });
  return container;
}
