import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "@/lib/useMediaQuery";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMediaQuery", () => {
  it("returns the live result and follows changes", () => {
    let matches = true;
    const listeners = new Set<() => void>();
    const query = vi.spyOn(window, "matchMedia").mockImplementation(
      (q) =>
        ({
          media: q,
          get matches() {
            return matches;
          },
          addEventListener: (_: string, l: () => void) => listeners.add(l),
          removeEventListener: (_: string, l: () => void) => listeners.delete(l),
        }) as unknown as MediaQueryList,
    );

    const { result, unmount } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(true);
    expect(query).toHaveBeenCalledWith("(max-width: 900px)");

    act(() => {
      matches = false;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(false);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
