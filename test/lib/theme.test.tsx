import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCALE_KEY, THEMES, THEME_KEY, setScale, setTheme, useScale, useTheme } from "@/lib/theme";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#f5f5f7">';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("setTheme", () => {
  it("applies the scheme, remembers it and recolours the browser bar", () => {
    setTheme("ocean");
    expect(document.documentElement.dataset.theme).toBe("ocean");
    expect(localStorage.getItem(THEME_KEY)).toBe("ocean");
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute("content")).toBe("#e4eff9");
  });

  it("still applies when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("useTheme", () => {
  it("reads the current scheme and follows changes", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toBe("light");
    act(() => setTheme("forest"));
    expect(result.current).toBe("forest");
  });

  it("treats an unknown scheme as light", () => {
    document.documentElement.dataset.theme = "neon";
    expect(renderHook(() => useTheme()).result.current).toBe("light");
  });

  it("renders light on the server", () => {
    document.documentElement.dataset.theme = "dark";
    function Probe() {
      return <>{useTheme()}</>;
    }
    expect(renderToString(<Probe />)).toBe("light");
  });

  it("has a swatch and bar colour for every scheme", () => {
    for (const t of THEMES) {
      expect(t.swatch).toHaveLength(4);
      expect(t.bar).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("GUI scale", () => {
  beforeEach(() => document.documentElement.style.removeProperty("--ui-scale"));

  it("applies the scale, remembers it, and useScale follows it", () => {
    const { result } = renderHook(() => useScale());
    expect(result.current).toBe(1);
    act(() => setScale(1.25));
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.25");
    expect(localStorage.getItem(SCALE_KEY)).toBe("1.25");
    expect(result.current).toBe(1.25);
  });
});
