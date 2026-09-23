import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DateRangePicker, { type DateRange } from "@/components/DateRangePicker";

let sheet = false;
let reduced = true;
beforeEach(() => {
  sheet = false;
  reduced = true;
  vi.useFakeTimers({ now: new Date(2026, 2, 15) }); // Sunday 15 March 2026
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q) => ({ matches: q.includes("max-width") ? sheet : reduced, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

const mount = (value: DateRange = { start: "", end: "" }) => {
  const onChange = vi.fn();
  const view = render(<DateRangePicker value={value} onChange={onChange} />);
  return { onChange, ...view };
};
const trigger = () => screen.getByRole("button", { expanded: false, name: /Select dates|Mar|Dec|From/ });
const open = () => {
  fireEvent.click(document.querySelector(".dr-trigger")!);
  return screen.getByRole("dialog", { name: "Choose a date range" });
};
const day = (label: string) => screen.getByRole("gridcell", { name: label });
const month = () => document.querySelector(".dr-head b")!.textContent;
const classes = (d: number) => document.querySelector(`[data-day="2026-03-${String(d).padStart(2, "0")}"]`)!.className;

describe("DateRangePicker", () => {
  it("shows a placeholder until a date is chosen", () => {
    mount();
    expect(trigger().textContent).toBe("Select dates");
    expect(screen.queryByRole("button", { name: "Clear date range" })).toBeNull();
  });

  it("opens on this month with Monday-first weeks and focus on today", () => {
    mount();
    open();
    expect(month()).toBe("March 2026");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(42);
    expect(cells[0].getAttribute("data-day")).toBe("2026-02-23");
    expect(cells[0].className).toContain("out");
    expect(classes(15)).toContain("today");
    expect(document.activeElement).toBe(day("Sunday, 15 March 2026"));
    expect(screen.getByText("Pick a start date")).toBeTruthy();
  });

  it("starts a range on the first click", () => {
    const { onChange } = mount();
    open();
    fireEvent.click(day("Thursday, 12 March 2026"));
    expect(onChange).toHaveBeenCalledWith({ start: "2026-03-12", end: "" });
  });

  it("ends the range on the second click, in either direction, then closes", () => {
    const { onChange } = mount({ start: "2026-03-12", end: "" });
    expect(trigger().textContent).toBe("From 12 Mar 2026");
    open();
    expect(screen.getByText("Now pick an end date")).toBeTruthy();
    fireEvent.click(day("Friday, 20 March 2026"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-03-12", end: "2026-03-20" });
    fireEvent.click(day("Thursday, 5 March 2026"));
    expect(onChange).toHaveBeenLastCalledWith({ start: "2026-03-05", end: "2026-03-12" });
    act(() => vi.advanceTimersByTime(550));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("previews the range under the pointer before the end is picked", () => {
    mount({ start: "2026-03-12", end: "" });
    open();
    fireEvent.pointerEnter(day("Sunday, 15 March 2026"));
    expect([classes(13), classes(14)].every((c) => c.includes("in"))).toBe(true);
    expect(classes(15)).toContain("end");
    fireEvent.pointerLeave(screen.getByRole("grid"));
    expect(classes(13)).not.toContain("in");
  });

  it("shows a chosen range and its length", () => {
    const { onChange } = mount({ start: "2026-03-12", end: "2026-03-20" });
    expect(trigger().textContent).toBe("12 Mar – 20 Mar 20269 days");
    open();
    expect(document.querySelector(".dr-range")!.textContent).toBe("12 Mar – 20 Mar 20269 days");
    expect(classes(12)).toContain("end first");
    expect(classes(16)).toContain("in");
    expect(classes(20)).toContain("end last");
    expect(day("Friday, 20 March 2026").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(day("Monday, 2 March 2026"));
    expect(onChange).toHaveBeenCalledWith({ start: "2026-03-02", end: "" }); // a new range
  });

  it("labels a one-day range and ranges across years", () => {
    const { rerender } = mount({ start: "2026-03-12", end: "2026-03-12" });
    expect(trigger().textContent).toBe("12 Mar 2026");
    open();
    expect(document.querySelector(".dr-range small")!.textContent).toBe("1 day");
    rerender(<DateRangePicker value={{ start: "2025-12-28", end: "2026-01-03" }} onChange={vi.fn()} />);
    expect(document.querySelector(".dr-trigger")!.textContent).toBe("28 Dec 2025 – 3 Jan 20267 days");
  });

  it("clears from the trigger and from the calendar", () => {
    const { onChange } = mount({ start: "2026-03-12", end: "" });
    fireEvent.click(screen.getByRole("button", { name: "Clear date range" }));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange.mock.calls).toEqual([[{ start: "", end: "" }], [{ start: "", end: "" }]]);
  });

  it("steps between months", () => {
    mount();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(month()).toBe("April 2026");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(month()).toBe("February 2026");
  });

  it("moves through days and months from the keyboard", () => {
    mount();
    open();
    fireEvent.keyDown(day("Sunday, 15 March 2026"), { key: "ArrowRight" });
    act(() => vi.advanceTimersToNextFrame());
    expect(document.activeElement).toBe(day("Monday, 16 March 2026"));
    fireEvent.keyDown(day("Monday, 16 March 2026"), { key: "ArrowUp" });
    act(() => vi.advanceTimersToNextFrame());
    expect(document.activeElement).toBe(day("Monday, 9 March 2026"));
    fireEvent.keyDown(day("Monday, 9 March 2026"), { key: "PageDown" });
    act(() => vi.advanceTimersToNextFrame());
    expect(month()).toBe("April 2026");
    expect(document.activeElement).toBe(day("Thursday, 9 April 2026"));
  });

  it("closes on Escape, a click outside, or the trigger", () => {
    mount();
    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(document.querySelector(".dr-overlay")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.click(document.querySelector(".dr-trigger")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("plays the exit animation before closing", () => {
    reduced = false;
    mount();
    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".dr-pop")!.className).toContain("closing");
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sits under the trigger, or above it when there is no room below", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 700, bottom: 730, right: 1000 } as DOMRect);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(380);
    mount();
    const pop = open();
    expect([pop.style.left, pop.style.top, pop.style.visibility]).toEqual(["680px", "312px", "visible"]);
  });

  it("becomes a bottom sheet on phones and tablets", () => {
    sheet = true;
    mount();
    const dialog = open();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Select dates" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
