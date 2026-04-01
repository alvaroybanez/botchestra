import { describe, expect, it } from "vitest";
import { buildObservation } from "./observationBuilder";

describe("buildObservation input value summaries", () => {
  it("distinguishes filled values from empty placeholders in interactive element summaries", () => {
    const observation = buildObservation(
      {
        url: "https://shop.example.com/contact",
        title: "Contact us",
        visibleText: "Reach out to our support team.",
        interactiveElements: [
          {
            role: "textbox",
            label: "Full name",
            selector: "#full-name",
            value: "",
            placeholder: "Jane Smith",
          } as never,
          {
            role: "textbox",
            label: "Email",
            selector: "#email",
            value: "alex@example.com",
            placeholder: "jane@example.com",
          } as never,
          {
            role: "select",
            label: "Topic",
            selector: "#topic",
            value: "",
            placeholder: "",
          } as never,
        ],
        actionHistory: [],
        progress: {
          currentStep: 0,
          maxSteps: 4,
          goal: "Send a contact request.",
        },
      },
      { tokenBudget: 200 },
    );

    expect(observation.interactiveElementSummary).toContain(
      'textbox "Full name" (#full-name) [empty, placeholder: "Jane Smith"]',
    );
    expect(observation.interactiveElementSummary).toContain(
      'textbox "Email" (#email) value="alex@example.com"',
    );
    expect(observation.interactiveElementSummary).toContain(
      'select "Topic" (#topic) [empty]',
    );
  });
});
