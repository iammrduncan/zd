import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticStatus, InstrumentationClient } from "@/instrumentation";
import { attachWorkbenchDiagnostics, mountDiagnosticSettings } from "@/workbench/diagnostics";
import {
  diagnosticsEnabled,
  forgetPreferences,
  setDiagnosticsEnabled,
} from "@/workbench/preferences";
import type { ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

const off: DiagnosticStatus = {
  enabled: false,
  sessionId: null,
  backgroundSampling: false,
  problem: null,
};

function client() {
  let status = off;
  const enable = vi.fn(async () => {
    status = {
      enabled: true,
      sessionId: "session-1",
      backgroundSampling: true,
      problem: null,
    };
    return status;
  });
  const disable = vi.fn(async () => {
    status = off;
    return status;
  });
  return {
    value: {
      snapshot: () => status,
      enable,
      disable,
      record: vi.fn(async () => ({ recorded: false, problem: null })),
      startSpan: vi.fn(() => null),
    } satisfies InstrumentationClient,
    enable,
    disable,
  };
}

afterEach(() => {
  forgetPreferences();
  window.localStorage.clear();
});

describe("local diagnostic settings", () => {
  it("records bounded active-context transitions without file identifiers or roots", async () => {
    const alpha: ProjectGrant = {
      id: "alpha",
      name: "Alpha",
      root: "/private/alpha",
      availability: "available",
      worktrees: [
        {
          id: "alpha-root",
          name: "main",
          root: "/private/alpha",
          availability: "available",
        },
      ],
    };
    const beta: ProjectGrant = {
      id: "beta",
      name: "Beta",
      root: "/private/beta",
      availability: "available",
      worktrees: [
        {
          id: "beta-root",
          name: "main",
          root: "/private/beta",
          availability: "available",
        },
      ],
    };
    const owner = createWorkbenchStateOwner(
      workbenchStateFromGrants([alpha, beta], {
        project: alpha,
        worktreeId: "alpha-root",
        relativePath: null,
        problem: null,
      }),
    );
    const instrumentation = client();
    const detach = attachWorkbenchDiagnostics(owner, instrumentation.value);

    await owner.activateProject("beta");
    await owner.activateFile({
      projectId: "beta",
      worktreeId: "beta-root",
      relativePath: "src/private-name.ts",
    });

    expect(instrumentation.value.record).toHaveBeenCalledWith({
      recordType: "event",
      operation: "project.transition",
      outcome: "ok",
      context: { projectId: "beta", worktreeId: "beta-root" },
    });
    expect(instrumentation.value.record).toHaveBeenCalledWith({
      recordType: "event",
      operation: "file.transition",
      outcome: "ok",
      context: {
        projectId: "beta",
        worktreeId: "beta-root",
        logicalPath: "src/private-name.ts",
      },
    });
    expect(JSON.stringify(instrumentation.value.record.mock.calls)).not.toContain("/private/");

    detach();
  });

  it("stays collapsed and off until the person explicitly opts in", async () => {
    const instrumentation = client();
    const reveal = vi.fn(async () => {});
    const host = document.createElement("div");

    const unmount = mountDiagnosticSettings(host, instrumentation.value, reveal);
    const settings = host.querySelector<HTMLDetailsElement>("[data-diagnostic-settings]")!;
    const toggle = host.querySelector<HTMLInputElement>("[data-diagnostics-toggle]")!;

    expect(settings.open).toBe(false);
    expect(toggle.checked).toBe(false);
    expect(instrumentation.enable).not.toHaveBeenCalled();

    settings.open = true;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(instrumentation.enable).toHaveBeenCalledOnce());
    expect(toggle.checked).toBe(true);
    expect(diagnosticsEnabled()).toBe(true);
    expect(host.querySelector("[role=status]")?.textContent).toContain("Recording locally");

    host.querySelector<HTMLButtonElement>("[data-diagnostics-reveal]")!.click();
    await vi.waitFor(() => expect(reveal).toHaveBeenCalledOnce());

    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(instrumentation.disable).toHaveBeenCalledOnce());
    expect(toggle.checked).toBe(false);
    expect(diagnosticsEnabled()).toBe(false);
    unmount();
    expect(host.children).toHaveLength(0);
  });

  it("shows an enable problem and does not persist a failed opt-in", async () => {
    setDiagnosticsEnabled(true);
    const instrumentation = client();
    instrumentation.value.enable = vi.fn(async () => ({
      ...off,
      problem: "diagnostic directory is unavailable",
    }));
    const host = document.createElement("div");

    mountDiagnosticSettings(host, instrumentation.value, async () => {});
    host.querySelector<HTMLDetailsElement>("[data-diagnostic-settings]")!.open = true;
    const toggle = host.querySelector<HTMLInputElement>("[data-diagnostics-toggle]")!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));

    await vi.waitFor(() =>
      expect(host.querySelector("[role=status]")?.textContent).toContain(
        "diagnostic directory is unavailable",
      ),
    );
    expect(toggle.checked).toBe(false);
    expect(diagnosticsEnabled()).toBe(false);
  });
});
