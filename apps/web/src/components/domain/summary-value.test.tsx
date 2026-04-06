import ReactDOM from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { SummaryValue, SummaryGrid } from "@/components/domain/summary-value";

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

describe("SummaryValue", () => {
  it("renders label and value as dt/dd in default card variant", () => {
    const container = render(
      <SummaryValue label="Run budget" value="64" />,
    );

    const dt = container.querySelector("dt");
    const dd = container.querySelector("dd");

    expect(dt).not.toBeNull();
    expect(dd).not.toBeNull();
    expect(dt!.textContent).toContain("Run budget");
    expect(dd!.textContent).toContain("64");
  });

  it("renders inline variant with space-y-1 wrapper", () => {
    const container = render(
      <SummaryValue label="Infra errors" value="12" variant="inline" />,
    );

    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain("space-y-1");
  });

  it("renders bordered variant with border and bg-background", () => {
    const container = render(
      <SummaryValue
        label="Low anchor"
        value="Needs reassurance"
        variant="bordered"
      />,
    );

    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain("border");
    expect(wrapper.className).toContain("bg-background");
  });

  it("passes through className to the wrapper", () => {
    const container = render(
      <SummaryValue label="L" value="V" className="mt-4" />,
    );

    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain("mt-4");
  });
});

describe("SummaryGrid", () => {
  it("renders children inside a dl with configurable columns", () => {
    const container = render(
      <SummaryGrid columns="sm:grid-cols-2">
        <SummaryValue label="A" value="1" />
      </SummaryGrid>,
    );

    const dl = container.querySelector("dl");

    expect(dl).not.toBeNull();
    expect(dl!.className).toContain("grid");
    expect(dl!.className).toContain("sm:grid-cols-2");
  });

  it("passes through className", () => {
    const container = render(
      <SummaryGrid className="custom">
        <SummaryValue label="A" value="1" />
      </SummaryGrid>,
    );

    const dl = container.querySelector("dl");

    expect(dl).not.toBeNull();
    expect(dl!.className).toContain("custom");
  });
});
