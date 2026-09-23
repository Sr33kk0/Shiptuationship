import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.fn();
let onLoaded: () => void;
const google = { charts: { load, setOnLoadCallback: (cb: () => void) => (onLoaded = cb) }, visualization: {} };

async function fresh() {
  vi.resetModules();
  return (await import("@/lib/googleCharts")).loadGeoChart;
}
const script = () => document.head.querySelector<HTMLScriptElement>('script[src="https://www.gstatic.com/charts/loader.js"]');

beforeEach(() => {
  document.head.innerHTML = "";
  load.mockClear();
  (window as { google?: unknown }).google = google;
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { google?: unknown }).google;
});

describe("loadGeoChart", () => {
  it("adds the loader once and resolves when the geochart package is ready", async () => {
    const loadGeoChart = await fresh();
    const first = loadGeoChart();
    expect(loadGeoChart()).toBe(first);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(script()!.async).toBe(true);

    script()!.onload!(new Event("load"));
    expect(load).toHaveBeenCalledWith("current", { packages: ["geochart"] });
    onLoaded();
    await expect(first).resolves.toBe(google);
  });

  it("passes the Maps API key when one is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "key123");
    const loadGeoChart = await fresh();
    loadGeoChart();
    script()!.onload!(new Event("load"));
    expect(load).toHaveBeenCalledWith("current", { packages: ["geochart"], mapsApiKey: "key123" });
  });

  it("rejects when the loader cannot load, and tries again next time", async () => {
    const loadGeoChart = await fresh();
    const first = loadGeoChart();
    script()!.onerror!(new Event("error"));
    await expect(first).rejects.toThrow("Could not load Google Charts (offline or blocked?)");
    expect(script()).toBeNull();

    const second = loadGeoChart();
    expect(second).not.toBe(first);
    expect(script()).not.toBeNull();
  });
});
