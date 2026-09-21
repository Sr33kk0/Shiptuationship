"use client";

import { useRef } from "react";
import { countByCountry } from "@/lib/ports";
import { topN } from "@/lib/top";
import { useShipments } from "@/lib/useShipments";
import { CATS, type Category } from "@/lib/shipments";
import CategoryChart, { COLORS } from "./CategoryChart";
import CountUp from "./CountUp";
import GeoHeat from "./GeoHeat";
import { Icon } from "./Icon";
import Profile from "./Profile";
import TopBars from "./TopBars";
import { NavLink } from "./Shell";

// Map colour ramps, light -> dark. Constants, so the maps aren't redrawn on every render.
const OUTBOUND = ["#fde2e6", "#fb7185", "#be123c"];
const INBOUND = ["#dbeafe", "#60a5fa", "#1d4ed8"];
const OUTBOUND_DARK = ["#a23a58", "#f0587a", "#ffb3c1"];
const INBOUND_DARK = ["#1f6a9b", "#38bdf8", "#bae6fd"];

// "64 shipments · 5 countries", plus a note if some ports couldn't be tied to a country
const mapNote = (m: { rows: unknown[]; placed: number; unplaced: number }) =>
  `${m.placed} shipments · ${m.rows.length} ${m.rows.length === 1 ? "country" : "countries"}${m.unplaced ? ` (${m.unplaced} unplaced)` : ""}`;

export default function Dashboard() {
  const { shipments, loadState } = useShipments();
  const loading = loadState === "loading";
  // seconds still to wait, from page mount, before a count-up should start (so it plays once its card has faded in)
  const mountedAt = useRef(performance.now());
  const wait = (t: number) => Math.max(0, t - (performance.now() - mountedAt.current) / 1000);

  const cmp = shipments.filter((s) => s.category === "document-comparison");
  const validated = cmp.filter((s) => s.status === "clean").length;
  const needsReview = cmp.filter((s) => s.status === "discrepancy").length;
  const read = shipments.filter((s) => s.isRead).length;
  const unread = shipments.length - read;
  // read / total per category, biggest first, for the "Read by category" rows
  const byCat = (Object.keys(CATS) as Category[])
    .map((key) => {
      const list = shipments.filter((s) => s.category === key);
      return { key, total: list.length, read: list.filter((s) => s.isRead).length };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const ratio = shipments.length ? read / shipments.length : 0;
  const percent = read > 0 && ratio < 0.01 ? "<1" : Math.round(ratio * 100); // never shows 0% while some emails are read

  // Shipper / consignee / notify party come from the shipping instruction (what the customer asked for), falling back to the draft BL.
  const docs = shipments.flatMap((s) => s.referenceFields ?? s.extractedFields ?? []);
  const shippers = topN(docs.map((f) => f.shipper));
  const consignees = topN(docs.map((f) => f.consignee));
  const notifyParties = topN(docs.map((f) => f.notifyParty));
  const senders = topN(shipments.map((s) => s.sender));
  const outbound = countByCountry(docs.map((f) => f.pol)); // Port of Loading: where cargo ships from
  const inbound = countByCountry(docs.map((f) => f.pod)); // Port of Discharge: where it ships to

  return (
    <div className="scroll">
      <header className="page-head fade-up">
        <div>
          <h1>Dashboard Overview</h1>
          <p>Email intake, automated SI and BL cross-verification, and discrepancy review.</p>
        </div>
        <Profile />
      </header>

      <div className="cards">
        <div className="card static wide fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
          <div>
            <div className="card-top">
              <span className="card-title">Email Read Status</span>
              <span className="muted">{loading ? <span className="skel skel-inline" /> : `${percent}% read`}</span>
            </div>
            <div className="stats">
              <div>
                <div className="big" style={unread > 0 ? { color: "var(--blue)" } : undefined}>
                  {loading ? <span className="skel skel-num" /> : <CountUp value={unread} delay={wait(0.3)} />}
                </div>
                <span className="stat-label">Unread</span>
              </div>
              <div>
                <div className="big">{loading ? <span className="skel skel-num" /> : <CountUp value={read} delay={wait(0.42)} />}</div>
                <span className="stat-label">Read</span>
              </div>
            </div>
            {loading ? (
              <span className="skel progress-skel" />
            ) : (
              <div className="progress" role="progressbar" aria-label="Emails read" aria-valuemin={0} aria-valuemax={shipments.length} aria-valuenow={read}>
                <span style={{ width: `${ratio * 100}%` }} />
              </div>
            )}
            <div className="card-foot">
              <span>{loading ? "Counting emails…" : `${read} of ${shipments.length} emails read`}</span>
              <b style={unread > 0 ? { color: "var(--blue)" } : undefined}>{loading ? "" : `${unread} unread`}</b>
            </div>
          </div>
          <div className="cat-block">
            <span className="stat-label">Read by category</span>
            <ul className="cat-read">
              {loading
                ? [0, 1, 2, 3].map((i) => (
                    <li key={i} aria-hidden="true">
                      <span className="skel" style={{ width: "100%" }} />
                    </li>
                  ))
                : byCat.map((c) => (
                    <li key={c.key} title={`${CATS[c.key].label}: ${c.read} of ${c.total} read`}>
                      <span className="legend-dot" style={{ background: COLORS[c.key] }} />
                      <span className="cr-name trunc">{CATS[c.key].label}</span>
                      <span className="cr-bar">
                        <span style={{ width: `${(c.read / c.total) * 100}%`, background: COLORS[c.key] }} />
                      </span>
                      <b>
                        {c.read}/{c.total}
                      </b>
                    </li>
                  ))}
            </ul>
          </div>
        </div>

        <div className="card static fade-up" style={{ "--d": "0.24s" } as React.CSSProperties}>
          <NavLink href="/emails?view=document-comparison" className="card-link" title="View all comparison requests">
            <div className="card-top">
              <span className="card-title">Total Comparison Requests</span>
              <span className="hint">
                View all
                <Icon d="chevR" size={14} sw={2.4} />
              </span>
            </div>
            <div className="big">{loading ? <span className="skel skel-num" /> : <CountUp value={cmp.length} delay={wait(0.42)} />}</div>
          </NavLink>
          <div className="pills">
            <NavLink href="/emails?view=validated" className="pill green" title="View cleared emails">
              <Icon d="check" size={20} sw={2} />
              <span>Emails Cleared</span>
              <b>{loading ? <span className="skel skel-inline" /> : <CountUp value={validated} delay={wait(0.54)} />}</b>
              <Icon d="chevR" size={18} sw={2.4} />
            </NavLink>
            <NavLink href="/emails?view=needs-review" className="pill red" title="View emails pending validation">
              <Icon d="alert" size={20} sw={2} />
              <span>Pending Validation</span>
              <b>{loading ? <span className="skel skel-inline" /> : <CountUp value={needsReview} delay={wait(0.54)} />}</b>
              <Icon d="chevR" size={18} sw={2.4} />
            </NavLink>
          </div>
        </div>
      </div>

      <CategoryChart shipments={shipments} loading={loading} />

      <div className="bars-grid four">
        <TopBars order={0} loading={loading} color="#60a5fa" title="Most Frequent Shippers" note={`Top 3 of ${shippers.total} shipments`} items={shippers.items} total={shippers.total} unit="shipments" />
        <TopBars order={1} loading={loading} color="#c084fc" title="Most Frequent Consignees" note={`Top 3 of ${consignees.total} shipments`} items={consignees.items} total={consignees.total} unit="shipments" />
        <TopBars order={2} loading={loading} color="#fbbf24" title="Most Frequent Notify Parties" note={`Top 3 of ${notifyParties.total} shipments`} items={notifyParties.items} total={notifyParties.total} unit="shipments" />
        <TopBars order={3} loading={loading} color="#fb7185" title="Most Frequent Email Senders" note={`Top 3 of ${senders.total} emails`} items={senders.items} total={senders.total} unit="emails" />
      </div>

      <div className="bars-grid">
        <GeoHeat order={0} loading={loading} palette={OUTBOUND} paletteDark={OUTBOUND_DARK} title="Outbound · Port of Loading" note={mapNote(outbound)} rows={outbound.rows} />
        <GeoHeat order={1} loading={loading} palette={INBOUND} paletteDark={INBOUND_DARK} title="Inbound · Port of Discharge" note={mapNote(inbound)} rows={inbound.rows} />
      </div>
    </div>
  );
}
