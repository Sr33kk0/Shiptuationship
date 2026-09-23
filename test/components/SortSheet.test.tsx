import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SortSheet from "@/components/SortSheet";

const options: ["id" | "subject" | "status", string][] = [["id", "Email #"], ["subject", "Subject"], ["status", "Status"]];
const reducedMotion = (on: boolean) => vi.spyOn(window, "matchMedia").mockReturnValue({ matches: on } as MediaQueryList);
const mount = (over = {}) => {
  const props = { open: true, options, value: "subject" as const, dir: "asc" as const, onChange: vi.fn(), onClose: vi.fn(), ...over };
  render(<SortSheet {...props} />);
  return props;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SortSheet", () => {
  it("renders nothing while closed", () => {
    mount({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens over the page with the current choice checked and focused", () => {
    mount();
    const dialog = screen.getByRole("dialog", { name: "Sort emails" });
    expect(dialog.parentElement!.parentElement).toBe(document.body);
    const current = screen.getByRole("radio", { name: "Subject" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(current);
    expect(screen.getByRole("button", { name: /Ascending/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("picks a field in the current direction and closes", () => {
    reducedMotion(true);
    const props = mount({ dir: "desc" });
    fireEvent.click(screen.getByRole("radio", { name: "Status" }));
    expect(props.onChange).toHaveBeenCalledWith("status", "desc");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("changes direction without closing", () => {
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: /Descending/ }));
    expect(props.onChange).toHaveBeenCalledWith("subject", "desc");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("plays the exit before closing", () => {
    vi.useFakeTimers();
    reducedMotion(false);
    const props = mount();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" })); // a second click during the exit is ignored
    expect(document.querySelector(".sheet-overlay")!.className).toContain("closing");
    expect(props.onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape or a tap on the backdrop, not inside the sheet", () => {
    reducedMotion(true);
    const props = mount();
    fireEvent.click(screen.getByRole("dialog"));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector(".sheet-overlay")!);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
