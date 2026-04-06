import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SummaryGrid, SummaryValue } from "@/components/summary-value";

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

describe("SummaryValue", () => {
  it('renders label and value as dt/dd in default "card" variant', () => {
    act(() => {
      root.render(<SummaryValue label="Run budget" value="64" />);
    });

    const dt = container.querySelector("dt")!;
    expect(dt.textContent).toBe("Run budget");

    const dd = container.querySelector("dd")!;
    expect(dd.textContent).toBe("64");

    const wrapper = dt.parentElement!;
    expect(wrapper.className).toContain("bg-card/50");
  });

  it('renders "inline" variant with space-y-1 wrapper', () => {
    act(() => {
      root.render(
        <SummaryValue label="Infra errors" value="12" variant="inline" />,
      );
    });

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("space-y-1");
    expect(wrapper.className).not.toContain("bg-card/50");
  });

  it('renders "bordered" variant with border and bg-background', () => {
    act(() => {
      root.render(
        <SummaryValue
          label="Low anchor"
          value="Needs reassurance"
          variant="bordered"
        />,
      );
    });

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("border");
    expect(wrapper.className).toContain("bg-background");
  });

  it("passes through className to the wrapper", () => {
    act(() => {
      root.render(<SummaryValue label="L" value="V" className="mt-4" />);
    });

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("mt-4");
  });
});

describe("SummaryGrid", () => {
  it("renders children inside a dl with configurable columns", () => {
    act(() => {
      root.render(
        <SummaryGrid columns="sm:grid-cols-2">
          <SummaryValue label="A" value="1" />
        </SummaryGrid>,
      );
    });

    const dl = container.querySelector("dl")!;
    expect(dl).toBeTruthy();
    expect(dl.className).toContain("grid");
    expect(dl.className).toContain("gap-3");
    expect(dl.className).toContain("sm:grid-cols-2");
  });

  it("passes through className", () => {
    act(() => {
      root.render(
        <SummaryGrid className="custom">
          <SummaryValue label="A" value="1" />
        </SummaryGrid>,
      );
    });

    const dl = container.querySelector("dl")!;
    expect(dl.className).toContain("custom");
  });
});
