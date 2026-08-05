import type { MiniApp } from "./types";

/** Opened when the command line names no mini app. */
export const DEFAULT_MINIAPP = "md";

const registered = new Map<string, MiniApp>();

/** Add a mini app. Registering the same id twice replaces the earlier one. */
export function register(app: MiniApp): void {
  registered.set(app.id, app);
}

/** Look up a mini app by id. Returns undefined for an unknown id. */
export function resolve(id: string): MiniApp | undefined {
  return registered.get(id);
}

/** Registered ids, in registration order. */
export function registeredIds(): string[] {
  return [...registered.keys()];
}

/** Test seam. Production code never needs this. */
export function clearRegistry(): void {
  registered.clear();
}
