import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TopBars from "@/components/TopBars";

const props = { title: "Most Frequent Shippers", note: "Top 3 of 8 shipments", total: 8, unit: "shipments", color: "#60a5fa", order: 1, loading: false };

describe("TopBars", () => {
  it("shows placeholders while counting", () => {
    const { container } = render(<TopBars {...props} items={[]} loading />);
    expect(screen.getByText("Counting…")).toBeTruthy();
    expect(container.querySelectorAll(".bar-row[aria-hidden]")).toHaveLength(3);
  });

  it("says when there is nothing to show", () => {
    render(<TopBars {...props} items={[]} />);
    expect(screen.getByText("No data yet")).toBeTruthy();
  });

  it("draws each item relative to the biggest, with its share of the total", () => {
    const { container } = render(<TopBars {...props} items={[{ name: "Acme", count: 4 }, { name: "Beta", count: 1 }]} />);
    expect(screen.getByText("Top 3 of 8 shipments")).toBeTruthy();
    expect(screen.getByTitle("Acme")).toBeTruthy();
    const fills = [...container.querySelectorAll<HTMLElement>(".bar-fill")].map((f) => f.style.getPropertyValue("--w"));
    expect(fills).toEqual(["100%", "25%"]);
    const badges = [...container.querySelectorAll(".bar-badge")].map((b) => b.textContent);
    expect(badges).toEqual(["50% of 8 shipments", "13% of 8 shipments"]);
  });

  it("shows 0% when the total is zero", () => {
    const { container } = render(<TopBars {...props} total={0} items={[{ name: "Acme", count: 1 }]} />);
    expect(container.querySelector(".bar-badge")!.textContent).toBe("0% of 0 shipments");
  });
});
