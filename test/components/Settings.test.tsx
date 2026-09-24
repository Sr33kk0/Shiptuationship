import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SCALES, THEMES } from "@/lib/theme";
import Settings from "@/components/Settings";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--ui-scale");
});

describe("Settings", () => {
  it("offers every colour scheme with the current one checked", () => {
    render(<Settings />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.querySelector("b")!.textContent)).toEqual(THEMES.map((t) => t.label));
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false", "false"]);
  });

  it("switches scheme on click", () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("radio", { name: /Sunset/ }));
    expect(document.documentElement.dataset.theme).toBe("sunset");
    expect(screen.getByRole("radio", { name: /Sunset/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Light/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("steps the interface size with the slider, applying on release", () => {
    render(<Settings />);
    const slider = screen.getByRole("slider", { name: "Interface size" });
    expect(slider.getAttribute("aria-valuetext")).toBe("100%");
    fireEvent.input(slider, { target: { value: String(SCALES.indexOf(1.75)) } }); // dragging: only the label follows
    expect(slider.getAttribute("aria-valuetext")).toBe("175%");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("");
    fireEvent.change(slider); // let go
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.75");
    expect(slider.getAttribute("aria-valuetext")).toBe("175%");
  });
});
