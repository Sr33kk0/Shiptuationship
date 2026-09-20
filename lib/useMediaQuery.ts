"use client";

import { useSyncExternalStore } from "react";

// Live result of a CSS media query. False on the server and on the first render, then corrects itself.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", notify);
      return () => m.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
