"use client";

import { useEffect, useRef, useState } from "react";

// Counts from whatever is on screen to `value` (0 on first render), easing out so it lands softly.
export default function CountUp({ value, ms = 800, delay = 0 }: { value: number; ms?: number; delay?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const wait = useRef(delay);
  wait.current = delay; // read when a count starts, not a dependency: re-renders must not restart it

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = Math.round(value); // same whole numbers as the animated path
      setShown(from.current);
      return;
    }
    const start = from.current;
    const t0 = performance.now() + wait.current * 1000; // holds at the start value until then
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(Math.max((now - t0) / ms, 0), 1);
      from.current = Math.round(start + (value - start) * (1 - (1 - p) ** 3));
      setShown(from.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return <>{shown}</>;
}
