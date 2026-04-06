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
            ref: "@e1",
            selector: "#full-name",
            value: "",
            placeholder: "Jane Smith",
          } as never,
          {
            role: "textbox",
            label: "Email",
            ref: "@e2",
            selector: "#email",
            value: "alex@example.com",
            placeholder: "jane@example.com",
          } as never,
          {
            role: "select",
            label: "Topic",
            ref: "@e3",
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
      'textbox "Full name" [@e1] (#full-name) [empty, placeholder: "Jane Smith"]',
    );
    expect(observation.interactiveElementSummary).toContain(
      'textbox "Email" [@e2] (#email) value="alex@example.com"',
    );
    expect(observation.interactiveElementSummary).toContain(
      'select "Topic" [@e3] (#topic) [empty]',
    );
  });
});
