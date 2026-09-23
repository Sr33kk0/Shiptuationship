import { describe, expect, it } from "vitest";
import { PAGE_SIZES, paginate } from "@/lib/pagination";

const items = Array.from({ length: 60 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the requested page and its 1-based range", () => {
    expect(paginate(items, 2, 25)).toEqual({ items: items.slice(25, 50), page: 2, pages: 3, from: 26, to: 50 });
  });

  it("returns a short last page", () => {
    const last = paginate(items, 3, 25);
    expect(last.items).toEqual(items.slice(50));
    expect([last.from, last.to]).toEqual([51, 60]);
  });

  it("clamps a page below 1 or past the end", () => {
    expect(paginate(items, 0, 25).page).toBe(1);
    expect(paginate(items, -4, 25).page).toBe(1);
    expect(paginate(items, 99, 25).page).toBe(3);
  });

  it("reports one empty page for an empty list", () => {
    expect(paginate([], 5, 25)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0 });
  });

  it("offers the page sizes the selector shows", () => {
    expect(PAGE_SIZES).toEqual([25, 50, 100]);
  });
});
