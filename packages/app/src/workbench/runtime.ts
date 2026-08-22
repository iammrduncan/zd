import type { Platform } from "@/platform";
import type { WorkbenchStateOwner } from "./state";
import type { LaunchRequest } from "./resources";

export type { LaunchRequest } from "./resources";

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
