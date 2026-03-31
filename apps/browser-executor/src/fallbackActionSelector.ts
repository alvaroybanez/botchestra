import type { ExecuteRunRequest } from "@botchestra/shared";
import type { AgentAction, SelectActionInput } from "./runExecutor";

function getDefaultAction(actionType: ExecuteRunRequest["taskSpec"]["allowedActions"][number]): AgentAction {
  switch (actionType) {
    case "wait":
      return { type: "wait", durationMs: 250, rationale: "Pause briefly to observe the page." };
    case "abort":
      return { type: "abort", rationale: "No safe fallback action is available." };
    case "scroll":
      return { type: "scroll", durationMs: 300, rationale: "Reveal more of the page." };
    default:
      return { type: actionType, rationale: `Fallback action: ${actionType}.` };
  }
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

    if (input.request.taskSpec.allowedActions.includes("finish")) {
      return {
        type: "finish",
        rationale: "End the run when no richer action selector is configured.",
      };
    }

    const fallbackActionType = input.request.taskSpec.allowedActions[0];
    if (!fallbackActionType) {
      return {
        type: "abort",
        rationale: "No allowed actions are available for the run.",
      };
    }

    return getDefaultAction(fallbackActionType);
  };
}
