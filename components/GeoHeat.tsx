"use client";

import { useEffect, useRef, useState } from "react";
import { loadGeoChart, type GeoChartInstance } from "@/lib/googleCharts";
import { countryName, type CountryCount } from "@/lib/ports";
import { useInView } from "@/lib/useInView";
import CountUp from "./CountUp";

interface Props {
  title: string;
  note: string;
  rows: CountryCount[]; // shipments per country, biggest first
  palette: string[]; // light -> dark
  order: number; // staggers the panels
  loading: boolean;
}

export default function GeoHeat({ title, note, rows, palette, order, loading }: Props) {
  const [panel, seen] = useInView<HTMLElement>(); // the entrance plays when the panel scrolls into view
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<GeoChartInstance | null>(null);
  const [lib, setLib] = useState<"loading" | "ready" | "error">("loading");
  const [width, setWidth] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const key = rows.map((r) => `${r.code}:${r.count}`).join(","); // redraw only when the numbers actually change

  useEffect(() => {
    let alive = true;
    loadGeoChart().then(
      () => alive && setLib("ready"),
      () => alive && setLib("error"),
    );
    return () => {
      alive = false;
    };
  }, []);

  // GeoChart doesn't resize itself, so track the box and redraw at its width
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    const g = window.google;
    if (lib !== "ready" || !el || !g || !width || !rows.length) return;
    chart.current ??= new g.visualization.GeoChart(el);
    chart.current.draw(g.visualization.arrayToDataTable([["Country", "Shipments"], ...rows.map((r) => [{ v: r.code, f: countryName(r.code) }, r.count])]), {
      width,
      height: Math.round(width * 0.62),
      region: "world",
      displayMode: "regions",
      resolution: "countries",
      backgroundColor: "transparent",
      datalessRegionColor: "#eceef2",
      defaultColor: "#eceef2",
      colorAxis: { colors: palette, minValue: 0 },
      legend: { textStyle: { color: "#737373", fontSize: 12 } },
      tooltip: { textStyle: { fontSize: 13 } },
      keepAspectRatio: true,
    });
    setDrawn(true);
    // rows is represented by `key`; passing it directly would redraw on every parent render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, width, key, palette]);

  useEffect(() => () => chart.current?.clearChart(), []);

  const empty = !loading && rows.length === 0;
  const message = lib === "error" ? "Couldn't load Google Charts. Check your connection and reload." : empty ? "No ports yet" : null;

  return (
    <section ref={panel} className={`panel bars geo${seen ? " in" : ""}`} style={{ "--d": `${order * 0.12}s` } as React.CSSProperties}>
      <h3 className="card-title">{title}</h3>
      <p className="bars-note">{loading ? "Mapping…" : note}</p>

      <div className={`geo-box${drawn ? " drawn" : ""}`}>
        <div ref={box} className="geo-canvas" />
        {!drawn && !message && <div className="skel geo-skel" />}
        {message && <p className="bars-empty geo-msg">{message}</p>}
      </div>

      {rows.length > 0 && (
        <ul className="geo-top">
          {rows.slice(0, 3).map((r, i) => (
            <li key={r.code} style={{ "--i": i } as React.CSSProperties}>
              <span className="legend-dot" style={{ background: palette[palette.length - 1] }} />
              <span>{countryName(r.code)}</span>
              <b>
                <CountUp value={seen ? r.count : 0} delay={order * 0.12 + 1.1 + i * 0.1} />
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
