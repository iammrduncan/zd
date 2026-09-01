import { listen } from "@tauri-apps/api/event";

interface DesktopHostStatus {
  readonly phase: "failed" | "disconnected";
  readonly problem: string | null;
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
