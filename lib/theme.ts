"use client";

import { useSyncExternalStore } from "react";

// Colour schemes. The CSS for each lives in globals.css under [data-theme="<id>"]; light is the default.
// swatch = [page, card, accent, solid], only used to draw the previews in Settings.
export const THEMES = [
  { id: "light", label: "Light", note: "The original look", swatch: ["#f5f5f7", "#ffffff", "#2563eb", "#0f172a"], bar: "#f5f5f7" },
  { id: "dark", label: "Dark", note: "Easy on the eyes at night", swatch: ["#000000", "#16181c", "#38bdf8", "#e7e9ea"], bar: "#000000" },
  { id: "ocean", label: "Ocean", note: "Cool blue-grey with a sea-blue accent", swatch: ["#e4eff9", "#ffffff", "#0369a1", "#0c4a6e"], bar: "#e4eff9" },
  { id: "forest", label: "Forest", note: "Soft green tones", swatch: ["#e6f1ea", "#ffffff", "#047857", "#14532d"], bar: "#e6f1ea" },
  { id: "sunset", label: "Sunset", note: "Warm sand with an orange accent", swatch: ["#f8ede2", "#ffffff", "#c2410c", "#7c2d12"], bar: "#f8ede2" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_KEY = "shiptuationship-theme";
const listeners = new Set<() => void>();

const current = (): ThemeId => {
  const id = document.documentElement.dataset.theme;
  return THEMES.some((t) => t.id === id) ? (id as ThemeId) : "light";
};

/** Applies a scheme now, remembers it in this browser, and tells anything drawn in JS (the maps) to redraw. */
export function setTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES.find((t) => t.id === id)!.bar);
  listeners.forEach((l) => l());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, current, () => "light");
}

// GUI scale: globals.css zooms the whole page by --ui-scale, so every size grows together. 1 is the default.
export const SCALES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const SCALE_KEY = "shiptuationship-scale";

const currentScale = () => Number(document.documentElement.style.getPropertyValue("--ui-scale")) || 1;

export function setScale(s: number) {
  document.documentElement.style.setProperty("--ui-scale", String(s));
  try {
    localStorage.setItem(SCALE_KEY, String(s));
  } catch {}
  listeners.forEach((l) => l());
}

export function useScale(): number {
  return useSyncExternalStore(subscribe, currentScale, () => 1);
}
