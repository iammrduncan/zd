import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

const INSTALLED_SMOKE_EVENT = "zd-installed-smoke";
const INSTALLED_SMOKE_PARAMETER = "zd-installed-smoke";
const INSTALLED_SMOKE_SCENARIOS = new Set(["normal", "forced", "crash"]);
let crashPresented = false;

function installedSmokeScenario(search = window.location.search): string | null {
  const parameters = new URLSearchParams(search);
  const values = parameters.getAll(INSTALLED_SMOKE_PARAMETER);
  return values.length === 1 && INSTALLED_SMOKE_SCENARIOS.has(values[0]!) ? values[0]! : null;
}

async function reportInstalledSmokeFailure(
  stage: "shell-action" | "retired-authority",
): Promise<void> {
  await emit(INSTALLED_SMOKE_EVENT, { checkpoint: "failed", stage });
}

export async function reportDesktopInstalledSmokeReady(): Promise<void> {
  if (!installedSmokeScenario()) return;
  try {
    await invoke("show_workbench");
  } catch {
    await reportInstalledSmokeFailure("shell-action");
    return;
  }
  try {
    await invoke("read_text_file", {});
  } catch {
    await emit(INSTALLED_SMOKE_EVENT, { checkpoint: "ready" });
    return;
  }
  await reportInstalledSmokeFailure("retired-authority");
}

function reportDesktopInstalledSmokeCrash(): void {
  if (crashPresented || installedSmokeScenario() !== "crash") return;
  crashPresented = true;
  void emit(INSTALLED_SMOKE_EVENT, { checkpoint: "crash-presented" });
}

interface DesktopHostStatus {
  readonly phase: "failed" | "disconnected";
  readonly problem: string | null;
}

export function mountDesktopHostStatus(host: HTMLElement): () => void {
  let active = true;
  let notice: HTMLParagraphElement | null = null;
  const pending = listen<DesktopHostStatus>("desktop-host-status", ({ payload }) => {
    if (!active) return;
    notice ??= document.createElement("p");
    notice.className = "zd-local-notice zd-desktop-host-status";
    notice.setAttribute("role", "alert");
    notice.setAttribute("aria-live", "assertive");
    notice.textContent = `zd disconnected: ${
      payload.problem ?? "The local workbench host is unavailable."
    }`;
    if (!notice.isConnected) host.append(notice);
    reportDesktopInstalledSmokeCrash();
  }).catch(() => null);
  return () => {
    active = false;
    void pending.then((unlisten) => unlisten?.());
    notice?.remove();
  };
}

export function mountDesktopStartup(host: HTMLElement): () => void {
  const section = document.createElement("section");
  section.className = "zd-served-unlock";
  section.setAttribute("aria-labelledby", "zd-desktop-startup-title");

  const title = document.createElement("h1");
  title.id = "zd-desktop-startup-title";
  title.textContent = "Starting zd";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Starting the local workbench host…";
  section.append(title, status);
  host.replaceChildren(section);

  let active = true;
  const pending = listen<DesktopHostStatus>("desktop-host-status", ({ payload }) => {
    if (!active) return;
    status.textContent =
      payload.problem ??
      (payload.phase === "disconnected"
        ? "The local workbench host disconnected."
        : "The local workbench host could not start.");
  }).catch(() => null);
  return () => {
    active = false;
    void pending.then((unlisten) => unlisten?.());
  };
}
