import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/lib/shipments";
import { shipment } from "@/test/fixtures";
import CategoryChart, { COLORS } from "@/components/CategoryChart";

const navigate = vi.fn();
vi.mock("@/components/Shell", () => ({ useNavigate: () => navigate }));

const emails = (counts: Partial<Record<Category, number>>) =>
  Object.entries(counts).flatMap(([category, n]) => Array.from({ length: n }, (_, i) => shipment({ id: `${category}-${i}`, category: category as Category })));
const slice = (name: RegExp) => screen.getByRole("button", { name });
const hint = () => document.querySelector(".chart-hint")!.textContent;

beforeEach(() => {
  navigate.mockClear();
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList); // CountUp shows final numbers
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CategoryChart", () => {
  it("lists the categories that have emails, biggest first, with the total", () => {
    const { container } = render(<CategoryChart shipments={emails({ spam: 1, "document-comparison": 3 })} />);
    expect([...container.querySelectorAll(".legend-name")].map((n) => n.textContent)).toEqual(["SI BL Comparison", "Spam"]);
    expect([...container.querySelectorAll(".legend b")].map((n) => n.textContent)).toEqual(["3", "1"]);
    expect(container.querySelector(".ring-center b")!.textContent).toBe("4");
    expect(screen.getByRole("group").getAttribute("aria-label")).toBe("4 emails by category");
    expect(container.querySelector(".slice path")!.getAttribute("fill")).toBe(COLORS["document-comparison"]);
  });

  it("highlights a slice on the first click and opens its emails on the second", () => {
    render(<CategoryChart shipments={emails({ spam: 1, "document-comparison": 3 })} />);
    expect(hint()).toBe("Click a slice to highlight it, then click it again to view those emails");
    fireEvent.click(slice(/^SI BL Comparison: 3 emails\. Select$/));
    expect(hint()).toBe("Click SI BL Comparison again to view its emails");
    expect(document.querySelector(".slice.pop .slice-badge")!.textContent).toBe("SI BL Comparison75%");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(slice(/Open in Emails/));
    expect(navigate).toHaveBeenCalledWith("/emails?view=document-comparison");
  });

  it("clears the highlight when the empty chart area is clicked", () => {
    render(<CategoryChart shipments={emails({ spam: 1 })} />);
    fireEvent.click(slice(/^Spam/));
    fireEvent.click(screen.getByRole("group"));
    expect(hint()).toMatch(/^Click a slice/);
  });

  it("works from the keyboard", () => {
    render(<CategoryChart shipments={emails({ invoice: 2 })} />);
    fireEvent.keyDown(slice(/^Invoice/), { key: "Enter" });
    fireEvent.keyDown(slice(/^Invoice/), { key: " " });
    expect(navigate).toHaveBeenCalledWith("/emails?view=invoice");
    fireEvent.keyDown(slice(/^Invoice/), { key: "a" });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("pops a slice out while hovered or focused", () => {
    render(<CategoryChart shipments={emails({ general: 1, spam: 2 })} />);
    fireEvent.mouseEnter(slice(/^General/));
    expect(document.querySelector(".slice.pop .slice-badge")!.textContent).toBe("General33%");
    fireEvent.mouseLeave(slice(/^General/));
    expect(document.querySelector(".slice.pop")).toBeNull();
    fireEvent.focus(slice(/^Spam/));
    expect(document.querySelector(".slice.pop")).not.toBeNull();
    fireEvent.blur(slice(/^Spam/));
    expect(document.querySelector(".slice.pop")).toBeNull();
  });

  it("shows under 1% as <1%", () => {
    render(<CategoryChart shipments={emails({ spam: 1, general: 150 })} />);
    fireEvent.mouseEnter(slice(/^Spam/));
    expect(document.querySelector(".slice.pop .slice-badge")!.textContent).toBe("Spam<1%");
  });

  it("draws the ring in, then drops the reveal mask", () => {
    vi.useFakeTimers();
    render(<CategoryChart shipments={emails({ spam: 1 })} />);
    const ring = () => document.querySelector("svg > g")!;
    expect(ring().getAttribute("mask")).toBe("url(#donut-reveal)");
    act(() => vi.advanceTimersByTime(2100));
    expect(ring().getAttribute("mask")).toBeNull();
  });

  it("shows placeholders while loading and a grey track when empty", () => {
    const { container } = render(<CategoryChart shipments={[]} loading />);
    expect(container.querySelectorAll(".legend li[aria-hidden]")).toHaveLength(5);
    expect(container.querySelector("circle.breathe")).not.toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
