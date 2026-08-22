import type { Platform } from "@/platform";
import { mountCurrentWorkspace } from "@/miniapps/md";
import { registerReference } from "@/suite/reference";
import { attachShortcuts } from "@/suite/shortcuts";
import { createWorkbenchStateOwner } from "./state";
import type { Unmount, WorkbenchMount } from "./runtime";

export type { WorkbenchMount } from "./runtime";

const NOTHING: Unmount = () => {};
const mountCurrentEditor: WorkbenchMount = (host, context) => mountCurrentWorkspace(host, context);

function saySoOnScreen(host: HTMLElement, message: string): void {
  const line = document.createElement("p");
  line.className = "zd-boot-notice";
  line.textContent = message;
  host.replaceChildren(line);
}

function reasonFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Boot the one workbench and return its complete teardown.
 *
 * Launch selects a path, never an application surface. The current Markdown
 * workspace remains the content mount until the new shell wraps it, but it is no
 * longer discovered through a selector or registry.
 */
export async function bootWorkbench(
  host: HTMLElement,
  platform: Platform,
  mount: WorkbenchMount = mountCurrentEditor,
): Promise<Unmount> {
  document.title = "zd";

  let launch;
  try {
    launch = await platform.launchRequest();
  } catch (cause) {
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  const detachShortcuts = attachShortcuts();
  const detachReference = registerReference(host);

  let unmount: Unmount;
  try {
    unmount = await mount(host, {
      launch,
      platform,
      state: createWorkbenchStateOwner(),
    });
  } catch (cause) {
    detachReference();
    detachShortcuts();
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  return () => {
    detachReference();
    detachShortcuts();
    unmount();
  };
}
