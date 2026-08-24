import "./diagnostics.css";

import type { DiagnosticStatus, InstrumentationClient } from "@/instrumentation";
import { mountAttentionSettings, type AttentionSettingsController } from "./attention";
import { diagnosticsEnabled, setDiagnosticsEnabled } from "./preferences";
import type { Unmount } from "./runtime";
import type { WorkbenchState, WorkbenchStateOwner } from "./state";

function contextFor(state: WorkbenchState) {
  const { active } = state;
  const file = state.openFiles.find(({ id }) => id === active.fileId);
  return {
    ...(active.projectId ? { projectId: active.projectId } : {}),
    ...(active.worktreeId ? { worktreeId: active.worktreeId } : {}),
    ...(active.threadId ? { threadId: active.threadId } : {}),
    ...(file ? { logicalPath: file.relativePath } : {}),
  };
}

/** Observe published root state, retaining identities and redacted logical path shape only. */
export function attachWorkbenchDiagnostics(
  owner: WorkbenchStateOwner,
  instrumentation: InstrumentationClient,
): Unmount {
  let previous = owner.snapshot();
  return owner.subscribe((next) => {
    const context = contextFor(next);
    const record = (operation: string) => {
      void instrumentation.record({ recordType: "event", operation, outcome: "ok", context });
    };

    if (previous.active.projectId !== next.active.projectId) record("project.transition");
    if (previous.active.worktreeId !== next.active.worktreeId) record("worktree.transition");
    if (previous.active.threadId !== next.active.threadId) record("thread.transition");
    if (previous.active.fileId !== next.active.fileId) record("file.transition");
    if (
      previous.projects.length !== next.projects.length ||
      previous.projects.some(({ id }, index) => next.projects[index]?.id !== id)
    ) {
      record("projects.change");
    }
    previous = next;
  });
}

function statusText(status: DiagnosticStatus): string {
  if (status.problem) return status.problem;
  return status.enabled ? "Recording locally." : "Off.";
}

/** Mount the compact, explicit control for local diagnostic evidence. */
export function mountDiagnosticSettings(
  host: HTMLElement,
  instrumentation: InstrumentationClient,
  reveal: () => Promise<void>,
  attention?: AttentionSettingsController,
): Unmount {
  const settings = document.createElement("details");
  settings.className = "zd-diagnostic-settings";
  settings.dataset.diagnosticSettings = "true";

  const summary = document.createElement("summary");
  summary.textContent = "SETTINGS";

  const body = document.createElement("div");
  body.className = "zd-diagnostic-settings-body";
  const heading = document.createElement("h3");
  heading.textContent = "Diagnostics";
  const label = document.createElement("label");
  label.className = "zd-diagnostic-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.dataset.diagnosticsToggle = "true";
  toggle.checked = instrumentation.snapshot().enabled && diagnosticsEnabled();
  const name = document.createElement("span");
  name.textContent = "Local diagnostics";
  label.append(toggle, name);

  const status = document.createElement("p");
  status.className = "zd-diagnostic-status";
  status.dataset.diagnosticStatus = "true";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const revealButton = document.createElement("button");
  revealButton.type = "button";
  revealButton.className = "zd-diagnostic-reveal";
  revealButton.dataset.diagnosticsReveal = "true";
  revealButton.textContent = "Reveal logs";
  const storage = document.createElement("p");
  storage.className = "zd-diagnostic-detail";
  storage.textContent = "Storage location: local application diagnostics directory.";
  const retention = document.createElement("p");
  retention.className = "zd-diagnostic-detail";
  retention.textContent = "Retention: bounded local log files for explicit diagnostic sessions.";
  body.append(heading, label, status, storage, retention, revealButton);
  const stopAttention = attention ? mountAttentionSettings(body, attention) : () => {};
  settings.append(summary, body);
  host.append(settings);

  let active = true;
  let transitioning = false;
  const render = (next: DiagnosticStatus) => {
    if (!active) return;
    toggle.checked = next.enabled;
    toggle.disabled = transitioning;
    status.textContent = statusText(next);
  };
  render(instrumentation.snapshot());

  const onToggle = () => {
    if (transitioning) return;
    transitioning = true;
    toggle.disabled = true;
    const requested = toggle.checked;
    if (!requested) setDiagnosticsEnabled(false);

    void (requested ? instrumentation.enable() : instrumentation.disable()).then((next) => {
      if (!active) return;
      transitioning = false;
      setDiagnosticsEnabled(next.enabled);
      render(next);
    });
  };
  toggle.addEventListener("change", onToggle);

  const onReveal = () => {
    revealButton.disabled = true;
    void reveal()
      .catch((cause: unknown) => {
        if (!active) return;
        status.textContent = cause instanceof Error ? cause.message : String(cause);
      })
      .finally(() => {
        if (active) revealButton.disabled = false;
      });
  };
  revealButton.addEventListener("click", onReveal);

  return () => {
    if (!active) return;
    active = false;
    toggle.removeEventListener("change", onToggle);
    revealButton.removeEventListener("click", onReveal);
    stopAttention();
    settings.remove();
  };
}
