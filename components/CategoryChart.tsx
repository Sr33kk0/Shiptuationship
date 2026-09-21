"use client";

import { useEffect, useRef, useState } from "react";
import { CATS, type Category, type Shipment } from "@/lib/shipments";
import CountUp from "./CountUp";
import { Icon } from "./Icon";
import { useNavigate } from "./Shell";

// Lighter, brighter versions of the CATS colours; chart only, table tags keep CATS.
export const COLORS: Record<Category, string> = {
  "document-comparison": "#60a5fa",
  "new-si": "#c084fc",
  invoice: "#fbbf24",
  general: "#94a3b8",
  spam: "#fb7185",
};

const SIZE = 340; // outer radius is 150; the spare margin is room for a popped-out segment
const MID = SIZE / 2;
const OUT = 150;
const HOLE = 60; // inner radius
const BAND = 20; // darker translucent band hugging the hole
const POP = 10; // how far a popped segment slides outward
const SCALE = 1.07; // popped segments also grow
const REACH = OUT * (SCALE - 1) + POP + 1; // how far past the ring a popped segment is drawn

const badgeW = (label: string) => Math.max(56, label.length * 6 + 20); // rough text width; no measuring in SVG
const pt = (r: number, a: number) => `${MID + r * Math.sin(a)} ${MID - r * Math.cos(a)}`;

// Annular sector from angle a0 to a1 (radians, clockwise from 12 o'clock), between radii r0 and r1.
const sector = (a0: number, a1: number, r0 = HOLE, r1 = OUT) => {
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(r1, a0)} A${r1} ${r1} 0 ${big} 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${big} 0 ${pt(r0, a0)}Z`;
};

export default function CategoryChart({ shipments, loading = false }: { shipments: Shipment[]; loading?: boolean }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<Category | null>(null);
  const [selected, setSelected] = useState<Category | null>(null);
  const [intro, setIntro] = useState(true); // true while the ring is still drawing itself in
  const mountedAt = useRef(performance.now());
  const sweepDelay = useRef<number | null>(null);

  const total = shipments.length;
  let start = 0;
  const rows = (Object.keys(CATS) as Category[])
    .map((key) => ({ key, count: shipments.filter((s) => s.category === key).length, label: CATS[key].label, color: COLORS[key] }))
    .sort((a, b) => b.count - a.count)
    .map((c) => {
      const pct = total ? (c.count / total) * 100 : 0;
      const a0 = (start / 100) * 2 * Math.PI;
      start += pct;
      const a1 = Math.min((start / 100) * 2 * Math.PI, a0 + 2 * Math.PI - 0.0001); // a full circle can't be one arc
      return { ...c, pct, a0, a1, mid: (a0 + a1) / 2, popped: c.key === hover || c.key === selected };
    })
    .filter((c) => c.count > 0);

  // The ring draws itself clockwise once the data is there. If the panel is still fading in (arriving from another page) wait for it.
  const hasRows = rows.length > 0;
  const selectedRow = rows.find((c) => c.key === selected);
  if (hasRows && sweepDelay.current === null) sweepDelay.current = Math.max(0.1, 0.75 - (performance.now() - mountedAt.current) / 1000);
  useEffect(() => {
    if (!hasRows) return;
    const t = window.setTimeout(() => setIntro(false), ((sweepDelay.current ?? 0.1) + 1.3) * 1000); // drop the mask once drawn
    return () => clearTimeout(t);
  }, [hasRows]);

  // First click pops a segment out and keeps it there; clicking it again opens that category in Emails.
  const activate = (key: Category) => (key === selected ? navigate(`/emails?view=${key}`) : setSelected(key));

  const segment = (c: (typeof rows)[number]) => (
    <g
      key={c.key}
      className={c.popped ? "slice pop" : "slice"}
      style={{ transformOrigin: `${MID}px ${MID}px`, "--s": SCALE, "--dx": `${Math.sin(c.mid) * POP}px`, "--dy": `${-Math.cos(c.mid) * POP}px` } as React.CSSProperties}
    >
      <path d={sector(c.a0, c.a1)} fill={c.color} />
      <path d={sector(c.a0, c.a1, HOLE, HOLE + BAND)} fill="#000" opacity={0.1} />
      {c.popped && (
        <g className="slice-badge" transform={`translate(${pt((OUT + HOLE) / 2, c.mid)})`}>
          <rect x={-badgeW(c.label) / 2} y={-22} width={badgeW(c.label)} height={44} rx={10} style={{ fill: "var(--solid)" }} />
          <text y={-9} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--on-solid-2)" }} fontSize={10.5} fontWeight={600}>
            {c.label}
          </text>
          <text y={8} textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--on-solid)" }} fontSize={16} fontWeight={800}>
            {c.pct >= 1 ? Math.round(c.pct) : "<1"}%
          </text>
        </g>
      )}
    </g>
  );

  return (
    <section className="panel fade-up" style={{ "--d": "0.5s" } as React.CSSProperties}>
      <h3 className="card-title">Emails by Category</h3>
      {/* the slices open their emails on a second click; nothing else on the chart says so */}
      <p className="chart-hint" aria-live="polite">
        {selectedRow ? (
          <>
            Click <b>{selectedRow.label}</b> again to view its emails
            <Icon d="chevR" size={14} sw={2.4} />
          </>
        ) : (
          "Click a slice to highlight it, then click it again to view those emails"
        )}
      </p>
      <div className="chart-body">
        <ul className="legend">
          {loading &&
            [130, 100, 150, 90, 110].map((w, i) => (
              <li key={i} aria-hidden="true">
                <span className="legend-dot skel-dot" />
                <span className="skel" style={{ width: w }} />
              </li>
            ))}
          {rows.map((c, i) => (
            <li key={c.key} className="fade-up" style={{ "--d": `${(sweepDelay.current ?? 0) + i * 0.12}s` } as React.CSSProperties}>
              <span className="legend-dot" style={{ background: c.color }} />
              <span className="legend-name">{c.label}</span>
              <b>
                <CountUp value={c.count} ms={1100} delay={(sweepDelay.current ?? 0) + i * 0.12} />
              </b>
            </li>
          ))}
        </ul>

        <div className="ring">
          <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={`${total} emails by category`} onClick={() => setSelected(null)}>
            {hasRows && (
              <defs>
                {/* a white ring stroke that grows clockwise from 12 o'clock; slices show only where it has reached */}
                <mask id="donut-reveal" maskUnits="userSpaceOnUse" x={-20} y={-20} width={SIZE + 40} height={SIZE + 40}>
                  <circle
                    className="donut-sweep"
                    style={{ animationDelay: `${sweepDelay.current}s` }}
                    cx={MID}
                    cy={MID}
                    r={(OUT + HOLE) / 2}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={2 * (OUT + REACH + 4 - (OUT + HOLE) / 2)}
                    pathLength={100}
                    strokeDasharray="100 100"
                    transform={`rotate(-90 ${MID} ${MID})`}
                  />
                </mask>
              </defs>
            )}
            {/* the grey track is the loading placeholder, and stays behind the ring while it draws in */}
            {(!hasRows || intro) && <circle className={loading ? "breathe" : undefined} cx={MID} cy={MID} r={(OUT + HOLE) / 2} fill="none" style={{ stroke: "var(--edge)" }} strokeWidth={OUT - HOLE} />}
            <g mask={intro && hasRows ? "url(#donut-reveal)" : undefined}>
              {rows.filter((c) => !c.popped).map(segment)}
              {rows.filter((c) => c.popped).map(segment)}
            </g>
            {/* Invisible hit areas: resting geometry, reaching out to cover the drawn segment once popped (only ever grows under the cursor, so no hover flicker). */}
            {rows.map((c) => (
              <path
                key={c.key}
                className="slice-hit"
                d={sector(c.a0, c.a1, HOLE, c.popped ? OUT + REACH : OUT)}
                role="button"
                tabIndex={0}
                aria-label={`${c.label}: ${c.count} emails. ${c.key === selected ? "Open in Emails" : "Select"}`}
                onMouseEnter={() => setHover(c.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(c.key)}
                onBlur={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  activate(c.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    activate(c.key);
                  }
                }}
              >
                <title>{`${c.label}: ${c.count}`}</title>
              </path>
            ))}
          </svg>
          <div className="ring-center">
            <b>{loading ? <span className="skel skel-total" /> : <CountUp value={total} ms={1100} delay={sweepDelay.current ?? 0} />}</b>
            <span>Total Emails</span>
          </div>
        </div>
      </div>
    </section>
  );
}
