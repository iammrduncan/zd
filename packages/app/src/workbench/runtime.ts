import type { Platform } from "@/platform";
import type { InstrumentationClient } from "@/instrumentation";
import type { WorkbenchStateOwner } from "./state";
import type { LaunchRequest } from "./resources";
import type { TransientCoordinator } from "./transients";

export type { LaunchRequest } from "./resources";

export type Unmount = () => void;

export interface WorkbenchContentContext {
  readonly launch: LaunchRequest;
  readonly platform: Platform;
}

export interface WorkbenchRuntimeContext extends WorkbenchContentContext {
  readonly state: WorkbenchStateOwner;
  readonly instrumentation: InstrumentationClient;
  readonly transients?: TransientCoordinator;
}

export type WorkbenchMount = (
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
) => Unmount | Promise<Unmount>;

/** Optional feature mounts behind the shell's stable semantic region hosts. */
export interface WorkbenchRegionMounts {
  readonly home?: WorkbenchMount;
  readonly threads?: WorkbenchMount;
  readonly thread?: WorkbenchMount;
  readonly file: WorkbenchMount;
  readonly files?: WorkbenchMount;
  readonly changes?: WorkbenchMount;
}
