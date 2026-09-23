import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, PATH } from "@/components/Icon";

describe("Icon", () => {
  it("draws the named path at the default size", () => {
    const { container } = render(<Icon d="check" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("stroke-width")).toBe("1.8");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("path")!.getAttribute("d")).toBe(PATH.check);
  });

  it("takes a custom size and stroke width", () => {
    const { container } = render(<Icon d="x" size={24} sw={3} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("height")).toBe("24");
    expect(svg.getAttribute("stroke-width")).toBe("3");
  });

  it("has a non-empty path for every icon name", () => {
    for (const [name, d] of Object.entries(PATH)) expect(d, name).toMatch(/^M/);
  });
});
