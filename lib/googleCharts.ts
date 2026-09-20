"use client";

// Just enough of the Google Charts API to draw a GeoChart.
interface GeoChart {
  draw(data: unknown, options: Record<string, unknown>): void;
  clearChart(): void;
}
interface GoogleNs {
  charts: { load(version: string, options: Record<string, unknown>): void; setOnLoadCallback(cb: () => void): void };
  visualization: { arrayToDataTable(rows: unknown[][]): unknown; GeoChart: new (el: Element) => GeoChart };
}
declare global {
  interface Window {
    google?: GoogleNs;
  }
}
export type GeoChartInstance = GeoChart;

// Loads Google's chart loader once and shares it between every map on the page.
// Regions mode with country codes needs no API key; set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY only if you later add markers or addresses.
let pending: Promise<GoogleNs> | null = null;
export function loadGeoChart(): Promise<GoogleNs> {
  pending ??= new Promise<GoogleNs>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://www.gstatic.com/charts/loader.js";
    s.async = true;
    s.onerror = () => {
      pending = null; // allow a retry on the next mount
      s.remove();
      reject(new Error("Could not load Google Charts (offline or blocked?)"));
    };
    s.onload = () => {
      const g = window.google!;
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      g.charts.load("current", { packages: ["geochart"], ...(key ? { mapsApiKey: key } : {}) });
      g.charts.setOnLoadCallback(() => resolve(g));
    };
    document.head.appendChild(s);
  });
  return pending;
}
