import { AttentionNotificationCoordinator, type AttentionThreadSource } from "@/notifications";
import type { Platform } from "@/platform";
import { AttentionSettingsController } from "./attention";
import type { Unmount } from "./runtime";
import type { WorkbenchStateOwner } from "./state";

type AttentionPlatform = Pick<
  Platform,
  "notifications" | "showWorkbench" | "isWindowFocused" | "onWindowFocusChanged"
>;

export interface WorkbenchAttentionRuntime {
  readonly settings: AttentionSettingsController;
  readonly coordinator: AttentionNotificationCoordinator;
  focused(): boolean;
  attach(): Unmount;
}

/** Bind optional native presentation to the root's already-committed attention event. */
export async function createWorkbenchAttentionRuntime(
  state: WorkbenchStateOwner,
  platform: AttentionPlatform,
  threads: AttentionThreadSource,
): Promise<WorkbenchAttentionRuntime> {
  let focused = await platform.isWindowFocused().catch(() => false);
  const settings = new AttentionSettingsController(platform.notifications);
  const coordinator = new AttentionNotificationCoordinator({
    adapter: platform.notifications,
    threads,
    settings: () => settings.snapshot().settings,
    window: {
      isFocused: () => focused,
      targetThreadOwnsFocus: (threadId) => {
        const snapshot = state.snapshot();
        return snapshot.active.threadId === threadId && snapshot.regions.focus === "thread";
      },
      showWorkbench: platform.showWorkbench,
    },
    reportProblem: (problem) => settings.reportRoutingProblem(problem),
  });

  return {
    settings,
    coordinator,
    focused: () => focused,
    attach: () => {
      const stopCoordinator = coordinator.start();
      const stopFocus = platform.onWindowFocusChanged((next) => {
        focused = next;
      });
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        stopFocus();
        stopCoordinator();
      };
    },
  };
}
