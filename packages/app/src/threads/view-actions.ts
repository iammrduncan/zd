import type { TransitionRecovery } from "@/workbench/state";
import type { ThreadActionResult } from "./types";

export function clearThreadStatus(status: HTMLElement): void {
  status.replaceChildren();
  status.hidden = true;
}

export function showThreadProblem(
  status: HTMLElement,
  reason: string,
  recovery?: TransitionRecovery,
): void {
  status.replaceChildren(document.createTextNode(reason));
  status.hidden = false;
  if (!recovery) return;
  const action = document.createElement("button");
  action.type = "button";
  action.className = "zd-thread-text-action";
  action.textContent = recovery.label;
  action.addEventListener("click", () => {
    void Promise.resolve(recovery.run())
      .then(() => clearThreadStatus(status))
      .catch((cause: unknown) =>
        showThreadProblem(status, cause instanceof Error ? cause.message : String(cause)),
      );
  });
  status.append(" ", action);
}

export async function performThreadAction(
  status: HTMLElement,
  operation: () => Promise<ThreadActionResult | null>,
): Promise<ThreadActionResult | null> {
  try {
    const result = await operation();
    if (result === null) return null;
    if (result.status === "committed") clearThreadStatus(status);
    else showThreadProblem(status, result.reason, result.recovery);
    return result;
  } catch (cause) {
    showThreadProblem(status, cause instanceof Error ? cause.message : String(cause));
    return null;
  }
}
