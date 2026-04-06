import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConfigStatusBadge,
  RunStatusBadge,
  SeverityBadge,
  StudyStatusBadge,
} from "@/components/status-badge";

let container: HTMLDivElement;
let root: ReactDOM.Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = ReactDOM.createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("StudyStatusBadge", () => {
  const studyStatusMap: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-slate-200", text: "text-slate-700" },
    persona_review: { bg: "bg-violet-100", text: "text-violet-800" },
    ready: { bg: "bg-sky-100", text: "text-sky-800" },
    queued: { bg: "bg-amber-100", text: "text-amber-800" },
    running: { bg: "bg-blue-100", text: "text-blue-800" },
    replaying: { bg: "bg-indigo-100", text: "text-indigo-800" },
    analyzing: { bg: "bg-fuchsia-100", text: "text-fuchsia-800" },
    completed: { bg: "bg-emerald-100", text: "text-emerald-800" },
    failed: { bg: "bg-rose-100", text: "text-rose-800" },
    cancelled: { bg: "bg-zinc-200", text: "text-zinc-700" },
  };

  for (const [status, { bg, text }] of Object.entries(studyStatusMap)) {
    it(`renders "${status}" with correct classes`, () => {
      act(() => {
        root.render(<StudyStatusBadge status={status} />);
      });

      const span = container.querySelector("span")!;
      expect(span.textContent).toBe(status.replaceAll("_", " "));
      expect(span.className).toContain(bg);
      expect(span.className).toContain(text);
    });
  }

  it("renders an unknown status gracefully", () => {
    act(() => {
      root.render(<StudyStatusBadge status="unknown_status" />);
    });

    const span = container.querySelector("span")!;
    expect(span.textContent).toBe("unknown status");
  });
});

describe("RunStatusBadge", () => {
  const runStatusMap: Record<string, { bg: string; text: string }> = {
    queued: { bg: "bg-amber-100", text: "text-amber-800" },
    dispatching: { bg: "bg-orange-100", text: "text-orange-800" },
    running: { bg: "bg-blue-100", text: "text-blue-800" },
    success: { bg: "bg-emerald-100", text: "text-emerald-800" },
    hard_fail: { bg: "bg-rose-100", text: "text-rose-800" },
    soft_fail: { bg: "bg-pink-100", text: "text-pink-800" },
    gave_up: { bg: "bg-violet-100", text: "text-violet-800" },
    timeout: { bg: "bg-yellow-100", text: "text-yellow-800" },
    blocked_by_guardrail: { bg: "bg-red-100", text: "text-red-800" },
    infra_error: { bg: "bg-slate-300", text: "text-slate-800" },
    cancelled: { bg: "bg-zinc-200", text: "text-zinc-700" },
  };

  for (const [status, { bg, text }] of Object.entries(runStatusMap)) {
    it(`renders "${status}" with correct classes`, () => {
      act(() => {
        root.render(<RunStatusBadge status={status} />);
      });

      const span = container.querySelector("span")!;
      expect(span.textContent).toBe(status.replaceAll("_", " "));
      expect(span.className).toContain(bg);
      expect(span.className).toContain(text);
    });
  }
});

describe("SeverityBadge", () => {
  const severityMap: Record<string, { bg: string; text: string }> = {
    blocker: { bg: "bg-rose-100", text: "text-rose-800" },
    major: { bg: "bg-amber-100", text: "text-amber-800" },
    minor: { bg: "bg-sky-100", text: "text-sky-800" },
    cosmetic: { bg: "bg-slate-200", text: "text-slate-700" },
  };

  for (const [severity, { bg, text }] of Object.entries(severityMap)) {
    it(`renders "${severity}" with correct classes`, () => {
      act(() => {
        root.render(
          <SeverityBadge
            severity={severity as "blocker" | "major" | "minor" | "cosmetic"}
          />,
        );
      });

      const span = container.querySelector("span")!;
      expect(span.textContent).toBe(severity);
      expect(span.className).toContain(bg);
      expect(span.className).toContain(text);
    });
  }
});

describe("ConfigStatusBadge", () => {
  const configStatusMap: Record<string, { bg: string; text: string }> = {
    draft: { bg: "bg-amber-100", text: "text-amber-800" },
    published: { bg: "bg-emerald-100", text: "text-emerald-800" },
    archived: { bg: "bg-slate-200", text: "text-slate-700" },
  };

  for (const [status, { bg, text }] of Object.entries(configStatusMap)) {
    it(`renders "${status}" with correct classes`, () => {
      act(() => {
        root.render(
          <ConfigStatusBadge
            status={status as "draft" | "published" | "archived"}
          />,
        );
      });

      const span = container.querySelector("span")!;
      expect(span.textContent).toBe(status);
      expect(span.className).toContain(bg);
      expect(span.className).toContain(text);
    });
  }
});

describe("All badges accept custom className", () => {
  it("StudyStatusBadge applies className", () => {
    act(() => {
      root.render(
        <StudyStatusBadge status="draft" className="custom-extra" />,
      );
    });
    expect(container.querySelector("span")!.className).toContain(
      "custom-extra",
    );
  });

  it("RunStatusBadge applies className", () => {
    act(() => {
      root.render(
        <RunStatusBadge status="queued" className="custom-extra" />,
      );
    });
    expect(container.querySelector("span")!.className).toContain(
      "custom-extra",
    );
  });

  it("SeverityBadge applies className", () => {
    act(() => {
      root.render(<SeverityBadge severity="blocker" className="custom-extra" />);
    });
    expect(container.querySelector("span")!.className).toContain(
      "custom-extra",
    );
  });

  it("ConfigStatusBadge applies className", () => {
    act(() => {
      root.render(
        <ConfigStatusBadge status="draft" className="custom-extra" />,
      );
    });
    expect(container.querySelector("span")!.className).toContain(
      "custom-extra",
    );
  });
});
