import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Pagination from "@/components/Pagination";

const props = { from: 26, to: 50, total: 60, page: 2, pages: 3, limit: 25, onPage: vi.fn(), onLimit: vi.fn() };
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("Pagination", () => {
  it("shows nothing when there are no rows", () => {
    const { container } = render(<Pagination {...props} total={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the range and page", () => {
    render(<Pagination {...props} />);
    expect(screen.getByText("Showing 26–50 of 60")).toBeTruthy();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });

  it("steps to the previous and next page", () => {
    render(<Pagination {...props} />);
    fireEvent.click(button("Previous page"));
    expect(props.onPage).toHaveBeenLastCalledWith(1);
    fireEvent.click(button("Next page"));
    expect(props.onPage).toHaveBeenLastCalledWith(3);
  });

  it("disables stepping past either end", () => {
    const { rerender } = render(<Pagination {...props} page={1} />);
    expect(button("Previous page").disabled).toBe(true);
    expect(button("Next page").disabled).toBe(false);
    rerender(<Pagination {...props} page={3} />);
    expect(button("Next page").disabled).toBe(true);
  });

  it("changes the page size", () => {
    render(<Pagination {...props} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["25", "50", "100"]);
    fireEvent.change(select, { target: { value: "100" } });
    expect(props.onLimit).toHaveBeenCalledWith(100);
  });
});
