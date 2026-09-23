import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CountUp from "@/components/CountUp";

const reducedMotion = (on: boolean) => vi.spyOn(window, "matchMedia").mockReturnValue({ matches: on } as MediaQueryList);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CountUp", () => {
  it("eases from 0 up to the value", () => {
    reducedMotion(false);
    const { container } = render(<CountUp value={100} ms={800} />);
    expect(container.textContent).toBe("0");
    act(() => vi.advanceTimersByTime(400));
    const mid = Number(container.textContent);
    expect(mid).toBeGreaterThan(50); // ease-out: past halfway at half time
    expect(mid).toBeLessThan(100);
    act(() => vi.advanceTimersByTime(500));
    expect(container.textContent).toBe("100");
  });

  it("holds at the start value for the delay", () => {
    reducedMotion(false);
    const { container } = render(<CountUp value={10} ms={100} delay={1} />);
    act(() => vi.advanceTimersByTime(900));
    expect(container.textContent).toBe("0");
    act(() => vi.advanceTimersByTime(300));
    expect(container.textContent).toBe("10");
  });

  it("counts on from what is shown when the value changes", () => {
    reducedMotion(false);
    const { container, rerender } = render(<CountUp value={10} ms={100} />);
    act(() => vi.advanceTimersByTime(200));
    rerender(<CountUp value={4} ms={100} />);
    expect(container.textContent).toBe("10");
    act(() => vi.advanceTimersByTime(200));
    expect(container.textContent).toBe("4");
  });

  it("jumps straight to the rounded value with reduced motion", () => {
    reducedMotion(true);
    const { container } = render(<CountUp value={7.6} />);
    expect(container.textContent).toBe("8");
  });

  it("stops animating when unmounted", () => {
    reducedMotion(false);
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    render(<CountUp value={5} />).unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
