import { describe, expect, it } from "vitest";
import { topN } from "@/lib/top";

describe("topN", () => {
  it("groups values ignoring case and extra spaces, showing the most common spelling", () => {
    const { items, total } = topN(["ACME  Ltd", "Acme Ltd", "acme ltd", "Acme Ltd", "Beta"]);
    expect(items[0]).toEqual({ name: "Acme Ltd", count: 4 });
    expect(total).toBe(5);
  });

  it("ranks by count, breaking ties alphabetically", () => {
    expect(topN(["b", "a", "c", "c"]).items).toEqual([
      { name: "c", count: 2 },
      { name: "a", count: 1 },
      { name: "b", count: 1 },
    ]);
  });

  it("keeps only the top n", () => {
    expect(topN(["a", "b", "c", "d"], 2).items.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("skips empty, blank and missing values", () => {
    expect(topN(["", "   ", null, undefined, "x"])).toEqual({ items: [{ name: "x", count: 1 }], total: 1 });
  });

  it("handles no values", () => {
    expect(topN([])).toEqual({ items: [], total: 0 });
  });
});
