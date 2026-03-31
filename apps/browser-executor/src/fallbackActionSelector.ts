import type { ExecuteRunRequest } from "@botchestra/shared";
import type { AgentAction, SelectActionInput } from "./runExecutor";

function getSafeFallbackAction(
  allowedActions: readonly ExecuteRunRequest["taskSpec"]["allowedActions"][number][],
): AgentAction {
  if (allowedActions.includes("finish")) {
    return { type: "finish", rationale: "End the run when no richer action selector is configured." };
  }

  if (allowedActions.includes("scroll")) {
    return { type: "scroll", durationMs: 300, rationale: "Reveal more of the page." };
  }

  if (allowedActions.includes("wait")) {
    return { type: "wait", durationMs: 250, rationale: "Pause briefly to observe the page." };
  }

  if (allowedActions.includes("abort")) {
    return { type: "abort", rationale: "No safe fallback action is available." };
  }

  return { type: "abort", rationale: "No safe fallback action is available." };
}

export function createFallbackActionSelector() {
  return async (input: SelectActionInput): Promise<AgentAction> => {
    if (input.stepIndex === 0) {
      const primaryElement = input.page.interactiveElements.find(
        (element) => typeof element.selector === "string" && element.selector.trim().length > 0,
      );

      if (primaryElement?.selector && input.request.taskSpec.allowedActions.includes("click")) {
        return {
          type: "click",
          selector: primaryElement.selector,
          rationale: `Try the prominent "${primaryElement.label}" control first.`,
        };
      }
    }

    return getSafeFallbackAction(input.request.taskSpec.allowedActions);
  };
}
