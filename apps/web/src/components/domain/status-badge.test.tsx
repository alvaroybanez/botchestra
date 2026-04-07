import ReactDOM from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  StudyStatusBadge,
  RunStatusBadge,
  SeverityBadge,
  ConfigStatusBadge,
} from "@/components/domain/status-badge";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }

  document.body.innerHTML = "";
});

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push(root);

  act(() => {
    root.render(element);
  });

  return container;
}

describe("StudyStatusBadge", () => {
  const studyStatuses = [
    "draft",
    "persona_review",
    "ready",
    "queued",
    "running",
    "replaying",
    "analyzing",
    "completed",
    "failed",
    "cancelled",
  ] as const;

  for (const status of studyStatuses) {
    it(`renders "${status}" with correct label`, () => {
      const container = render(<StudyStatusBadge status={status} />);
      const expectedLabel = status.replaceAll("_", " ");

      expect(container.textContent).toContain(expectedLabel);
    });
  }

  it("renders an unknown status gracefully", () => {
    const container = render(
      <StudyStatusBadge status={"unknown_status" as never} />,
    );

    expect(container.textContent).toContain("unknown status");
  });
});

describe("RunStatusBadge", () => {
  const runStatuses = [
    "queued",
    "dispatching",
    "running",
    "success",
    "hard_fail",
    "soft_fail",
    "gave_up",
    "timeout",
    "blocked_by_guardrail",
    "infra_error",
    "cancelled",
  ] as const;

  for (const status of runStatuses) {
    it(`renders "${status}" with correct label`, () => {
      const container = render(<RunStatusBadge status={status} />);
      const expectedLabel = status.replaceAll("_", " ");

      expect(container.textContent).toContain(expectedLabel);
    });
  }
});

describe("SeverityBadge", () => {
  const severities = ["blocker", "major", "minor", "cosmetic"] as const;
  const severityClassExpectations: Record<(typeof severities)[number], string> = {
    blocker: "bg-severity-blocker-muted",
    major: "bg-severity-major-muted",
    minor: "bg-severity-minor-muted",
    cosmetic: "bg-severity-cosmetic-muted",
  };

  for (const severity of severities) {
    it(`renders "${severity}" severity`, () => {
      const container = render(<SeverityBadge severity={severity} />);

      expect(container.textContent).toContain(severity);
    });

    it(`uses semantic severity tokens for "${severity}"`, () => {
      const container = render(<SeverityBadge severity={severity} />);
      const span = container.querySelector("span");

      expect(span).not.toBeNull();
      expect(span!.className).toContain(severityClassExpectations[severity]);
    });
  }
});

describe("ConfigStatusBadge", () => {
  const configStatuses = ["draft", "published", "archived"] as const;

  for (const status of configStatuses) {
    it(`renders "${status}" status`, () => {
      const container = render(<ConfigStatusBadge status={status} />);

      expect(container.textContent).toContain(status);
    });
  }
});

describe("all badges accept custom className", () => {
  it("StudyStatusBadge applies className", () => {
    const container = render(
      <StudyStatusBadge status="draft" className="custom-extra" />,
    );
    const span = container.querySelector("span");

    expect(span).not.toBeNull();
    expect(span!.className).toContain("custom-extra");
  });

  it("RunStatusBadge applies className", () => {
    const container = render(
      <RunStatusBadge status="queued" className="custom-extra" />,
    );
    const span = container.querySelector("span");

    expect(span).not.toBeNull();
    expect(span!.className).toContain("custom-extra");
  });

  it("SeverityBadge applies className", () => {
    const container = render(
      <SeverityBadge severity="blocker" className="custom-extra" />,
    );
    const span = container.querySelector("span");

    expect(span).not.toBeNull();
    expect(span!.className).toContain("custom-extra");
  });

  it("ConfigStatusBadge applies className", () => {
    const container = render(
      <ConfigStatusBadge status="draft" className="custom-extra" />,
    );
    const span = container.querySelector("span");

    expect(span).not.toBeNull();
    expect(span!.className).toContain("custom-extra");
  });
});
