import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInView } from "@/lib/useInView";

let fire: (isIntersecting: boolean) => void;
const observe = vi.fn();
const disconnect = vi.fn();
let options: IntersectionObserverInit | undefined;

beforeEach(() => {
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
        fire = (isIntersecting) => cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        options = opts;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function Panel() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref}>{seen ? "seen" : "hidden"}</div>;
}

describe("useInView", () => {
  it("turns true once the element is 30% in view, then stops watching", () => {
    render(<Panel />);
    expect(screen.getByText("hidden")).toBeTruthy();
    expect(observe).toHaveBeenCalledWith(screen.getByText("hidden"));
    expect(options).toEqual({ threshold: 0.3 });

    act(() => fire(false));
    expect(screen.getByText("hidden")).toBeTruthy();

    act(() => fire(true));
    expect(screen.getByText("seen")).toBeTruthy();
    expect(disconnect).toHaveBeenCalled();
  });

  it("stops watching when unmounted", () => {
    render(<Panel />).unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
