import type { Platform } from "@/platform";
import type { WorkbenchStateOwner } from "./state";

export interface LaunchRequest {
  /** Absolute native launch path, or null for the workbench home. */
  readonly path: string | null;
}

export type Unmount = () => void;

export interface WorkbenchContentContext {
  readonly launch: LaunchRequest;
  readonly platform: Platform;
}

export interface WorkbenchRuntimeContext extends WorkbenchContentContext {
  readonly state: WorkbenchStateOwner;
}

export type WorkbenchMount = (
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
) => Unmount | Promise<Unmount>;
