import type { DiagnosticOutcome } from "@/instrumentation";
import type { Unmount, WorkbenchRuntimeContext } from "./runtime";

/** Route native open requests through the same guarded root context transition as every other UI. */
export function attachOpenRequests(context: WorkbenchRuntimeContext): Unmount {
  let active = true;
  let switching = false;

  const record = (
    outcome: DiagnosticOutcome,
    projectId?: string,
    worktreeId?: string,
    logicalPath?: string | null,
  ) => {
    void context.instrumentation.record({
      recordType: "event",
      operation: "workbench.open-request",
      outcome,
      context: {
        ...(projectId ? { projectId } : {}),
        ...(worktreeId ? { worktreeId } : {}),
        ...(logicalPath ? { logicalPath } : {}),
      },
    });
  };

  const stop = context.platform.onOpenRequested(() => {
    if (!active || switching) return;
    switching = true;
    void (async () => {
      try {
        const pending = await context.platform.pendingOpenRequest();
        if (!pending || !active) return;
        const grants = await context.platform
          .projectGrants()
          .catch(() => (pending.project ? [pending.project] : []));
        const result = await context.state.applyLaunch(pending, grants);
        if (result.status === "refused") {
          record(
            "refused",
            pending.project?.id,
            pending.worktreeId ?? undefined,
            pending.relativePath,
          );
          return;
        }
        const accepted = await context.platform.acceptOpenRequest();
        record(
          accepted ? "ok" : "unavailable",
          pending.project?.id,
          pending.worktreeId ?? undefined,
          pending.relativePath,
        );
      } catch {
        record("failed");
      } finally {
        switching = false;
      }
    })();
  });

  return () => {
    if (!active) return;
    active = false;
    stop();
  };
}
