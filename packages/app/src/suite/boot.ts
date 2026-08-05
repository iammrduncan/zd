import type { Platform } from "@/platform";
import { DEFAULT_MINIAPP, resolve } from "./registry";
import { registerReference } from "./reference";
import { attachShortcuts } from "./shortcuts";
import type { Unmount } from "./types";

/** Nothing to undo. What a boot that never got anywhere hands back. */
const NOTHING: Unmount = () => {};

/**
 * Say one thing on the canvas, because there is no mini app to say it.
 *
 * DESIGN.md §7.10: a notice is "a sentence on the canvas, never a toast, modal,
 * banner, badge, or reserved status area". That holds when the thing that failed
 * is the app itself — arguably most of all then, since a window with nothing in it
 * is the one state a reader cannot act on.
 *
 * Replaces whatever was there. A half-mounted surface under an explanation of why
 * it is half-mounted is worse than the explanation alone.
 */
function saySoOnScreen(host: HTMLElement, message: string): void {
  const line = document.createElement("p");
  line.className = "zd-boot-notice";
  line.textContent = message;
  host.replaceChildren(line);
}

/** What went wrong, in the words whatever threw used. */
function reasonFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Resolve the launch request to a mini app and mount it.
 *
 * An unknown mini app id is not an error the caller has to handle — it falls
 * back to the default and says so on screen.
 *
 * **Neither is anything else.** `main.ts` is `void boot(host, detectPlatform())`,
 * so a rejection here is discarded and the reader gets a permanently blank window
 * — which is finding F02's failure shape ("the entire window goes blank") arriving
 * through a different door. Audit finding M4. Every path out of this function now
 * either mounts something or puts a sentence on the canvas, and it never rejects,
 * which is what makes the `void` at the call site honest rather than lucky.
 */
export async function boot(host: HTMLElement, platform: Platform): Promise<Unmount> {
  let launch;
  try {
    launch = await platform.launchRequest();
  } catch (cause) {
    /*
     * The IPC round trip, and the first thing that happens. An IPC
     * misconfiguration, a capability regression, anything at all on the Rust side
     * lands here — and there is no mini app yet, so there is nothing to tear down.
     */
    saySoOnScreen(host, `zd could not start: ${reasonFor(cause)}`);
    return NOTHING;
  }

  const app = resolve(launch.miniapp) ?? resolve(DEFAULT_MINIAPP);

  if (!app) {
    saySoOnScreen(host, `No mini app registered for "${launch.miniapp}".`);
    return NOTHING;
  }

  document.title = app.title;

  // The one keyboard listener in the app (§7.1, finding F16). Attached by the
  // suite before the mini app mounts, so a mini app registering a command never
  // has to know whether anything is listening yet — and so there is exactly one
  // place a chord can be read, which is the whole point of the registry.
  const detachShortcuts = attachShortcuts();
  // The Reference is a suite surface over whatever mini app is mounted (§3), so
  // it is registered here and the mini app never learns it exists.
  const detachReference = registerReference(host);

  let unmount: Unmount;
  try {
    unmount = await app.mount(host, { launch, platform });
  } catch (cause) {
    /*
     * The second door. `mount` is a mini app's own code and can fail for reasons
     * the suite cannot anticipate.
     *
     * Both suite listeners come off before the sentence goes up, and that order is
     * the point rather than tidiness: they were attached above, so leaving them
     * would put a Reference and a keyboard registry over a window holding nothing
     * but an apology — `cmd+.` would open a sheet listing a mini app that does not
     * exist.
     */
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
