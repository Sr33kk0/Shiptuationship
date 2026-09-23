import { cleanup } from "@testing-library/react";
import { createElement, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { afterEach, vi } from "vitest";

// next/link needs the App Router at runtime; a plain anchor keeps href, onClick and aria props testable.
// Like the real Link, it cancels the browser's own navigation after the caller's onClick has run.
vi.mock("next/link", () => ({
  default: ({ href, replace, scroll, prefetch, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean; scroll?: boolean; prefetch?: boolean }) =>
    createElement("a", {
      href: String(href),
      onClick: (e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        e.preventDefault();
      },
      ...props,
    }),
}));

// jsdom has none of these browser APIs; tests that care override them with vi.spyOn / vi.stubGlobal.
if (typeof window !== "undefined") {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.scrollTo ??= () => {};
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
