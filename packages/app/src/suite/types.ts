import type { Platform } from "@/platform";

/** Which mini app to open, and what it was asked to open. */
export interface LaunchRequest {
  /** Mini app id, e.g. "md". */
  readonly miniapp: string;
  /** Path the mini app should open. Null means "show your home surface". */
  readonly path: string | null;
}

/** Tear down a mounted mini app. Must be safe to call more than once. */
export type Unmount = () => void;

/**
 * Everything the suite hands a mini app. Deliberately small — a mini app that
 * needs more should get it through a new named field here, not by reaching
 * around into globals.
 */
export interface SuiteContext {
  readonly launch: LaunchRequest;
  readonly platform: Platform;
}

/**
 * A mini app is one `zd <thing>` surface you launch into: `zd md`, `zd td`.
 *
 * The whole contract is: give me an element, I fill it, and I give you back a
 * way to undo that. Mini apps never own the window, the design tokens, the
 * settings, or the shortcut registry — the suite does.
 *
 * Note what is *not* a mini app: the in-app terminal and the Shortcut Reference
 * open over whichever mini app is already mounted. Those are suite surfaces and
 * live in `src/suite/`; a mini app never cooperates with them.
 */
export interface MiniApp {
  readonly id: string;
  readonly title: string;
  mount(host: HTMLElement, ctx: SuiteContext): Unmount | Promise<Unmount>;
}
