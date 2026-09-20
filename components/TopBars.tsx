"use client";

import type { Top } from "@/lib/top";
import { useInView } from "@/lib/useInView";
import CountUp from "./CountUp";

interface Props {
  title: string;
  note: string; // what is being counted, e.g. "Top 3 of 61 shipments"
  items: Top[];
  total: number;
  unit: string; // "shipments" | "emails"
  color: string;
  order: number; // position in the grid, staggers the panels
  loading: boolean;
}

export default function TopBars({ title, note, items, total, unit, color, order, loading }: Props) {
  const [ref, seen] = useInView<HTMLElement>();
  const max = items[0]?.count ?? 1;
  const base = order * 0.1; // seconds after the panel comes into view

  return (
    <section ref={ref} className={`panel bars${seen ? " in" : ""}`} style={{ "--d": `${base}s` } as React.CSSProperties}>
      <h3 className="card-title">{title}</h3>
      <p className="bars-note">{loading ? "Counting…" : note}</p>

      <ul className="bar-list">
        {loading &&
          [0, 1, 2].map((i) => (
            <li key={i} className="bar-row" aria-hidden="true">
              <div className="bar-head">
                <span className="legend-dot skel-dot" />
                <span className="skel" style={{ width: [180, 140, 110][i] }} />
              </div>
              <div className="bar-track">
                <div className="skel bar-skel" style={{ width: `${[85, 60, 40][i]}%` }} />
              </div>
            </li>
          ))}

        {!loading && items.length === 0 && <li className="bars-empty">No data yet</li>}

        {!loading &&
          items.map((c, i) => {
            const delay = base + 0.3 + i * 0.12; // bar and number line up
            const share = total ? Math.round((c.count / total) * 100) : 0;
            return (
              <li key={c.name} className="bar-row">
                <div className="bar-head">
                  <span className="legend-dot" style={{ background: color }} />
                  <span className="bar-name" title={c.name}>
                    {c.name}
                  </span>
                  <b>
                    <CountUp value={seen ? c.count : 0} ms={900} delay={delay} />
                  </b>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ background: color, "--w": `${(c.count / max) * 100}%`, "--d": `${delay}s` } as React.CSSProperties} />
                  <span className="bar-badge">
                    {share}%{" "}
                    <small>
                      of {total} {unit}
                    </small>
                  </span>
                </div>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
