import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FilterMenu, { type FilterOption } from "@/components/FilterMenu";

const options: FilterOption[] = [
  { key: "", label: "All actions", href: "/audit/user", count: 5 },
  { key: "review_saved", label: "Review saved", href: "/audit/user?action=review_saved", count: 3, color: "#059669" },
  { key: "marked_read", label: "Marked read", href: "/audit/user?action=marked_read" },
];
const toggle = () => screen.getByRole("button", { name: /Action/ });

describe("FilterMenu", () => {
  it("shows the chosen option, falling back to the first", () => {
    const { rerender } = render(<FilterMenu title="Action" value="review_saved" options={options} />);
    expect(toggle().textContent).toContain("Review saved");
    rerender(<FilterMenu title="Action" value="bogus" options={options} />);
    expect(toggle().textContent).toContain("All actions");
  });

  it("opens a menu of links with counts and the current choice checked", () => {
    render(<FilterMenu title="Action" value="review_saved" options={options} />);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((i) => i.getAttribute("href"))).toEqual(options.map((o) => o.href));
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(items[0].textContent).toBe("All actions5");
    expect(items[2].textContent).toBe("Marked read");
  });

  it("closes on a choice, Escape, a click outside or the toggle", () => {
    render(<FilterMenu title="Action" value="" options={options} />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getAllByRole("menuitemradio")[1]);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(toggle());
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
