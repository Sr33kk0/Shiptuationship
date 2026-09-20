"use client";

import { useRef } from "react";
import { countByCountry } from "@/lib/ports";
import { topN } from "@/lib/top";
import { useShipments } from "@/lib/useShipments";
import CategoryChart from "./CategoryChart";
import CountUp from "./CountUp";
import GeoHeat from "./GeoHeat";
import TopBars from "./TopBars";
import { NavLink } from "./Shell";

// Map colour ramps, light -> dark. Constants, so the maps aren't redrawn on every render.
const OUTBOUND = ["#fde2e6", "#fb7185", "#be123c"];
const INBOUND = ["#dbeafe", "#60a5fa", "#1d4ed8"];

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
          <p>Ocean document intake, automated cross-verification, and discrepancy desk.</p>
        </div>
      </header>

      <div className="cards">
        <NavLink href="/emails?view=document-comparison" className="card fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
          <div>
            <div className="card-top">
              <span className="card-title">Comparison Requests</span>
            </div>
            <div className="big">{loading ? <span className="skel skel-num" /> : <CountUp value={cmp.length} delay={wait(0.3)} />}</div>
          </div>
          <div className="card-foot">
            <span>High-volume intake stream</span>
          </div>
        </NavLink>

        <NavLink href="/emails?view=validated" className="card fade-up" style={{ "--d": "0.24s" } as React.CSSProperties}>
          <div>
            <div className="card-top">
              <span className="card-title">Validated</span>
            </div>
            <div className="big" style={validated > 0 ? { color: "#059669" } : undefined}>
              {loading ? <span className="skel skel-num" /> : <CountUp value={validated} delay={wait(0.42)} />}
            </div>
          </div>
          <div className="card-foot">
            <span>Auto-cleared manifest checks</span>
          </div>
        </NavLink>

        <NavLink href="/emails?view=needs-review" className="card fade-up" style={{ "--d": "0.36s" } as React.CSSProperties}>
          <div>
            <div className="card-top">
              <span className="card-title">Needs Review</span>
            </div>
            <div className="big" style={needsReview > 0 ? { color: "#e11d48" } : undefined}>
              {loading ? <span className="skel skel-num" /> : <CountUp value={needsReview} delay={wait(0.54)} />}
            </div>
          </div>
          <div className="card-foot">
            <span>Flagged for operator review</span>
            <b style={{ color: "#e11d48" }}>
              {loading ? <span className="skel skel-inline" /> : <CountUp value={needsReview} delay={wait(0.54)} />} Pending
            </b>
          </div>
        </NavLink>
      </div>

      <CategoryChart shipments={shipments} loading={loading} />

      <div className="bars-grid four">
        <TopBars order={0} loading={loading} color="#60a5fa" title="Most Frequent Shippers" note={`Top 3 of ${shippers.total} shipments`} items={shippers.items} total={shippers.total} unit="shipments" />
        <TopBars order={1} loading={loading} color="#c084fc" title="Most Frequent Consignees" note={`Top 3 of ${consignees.total} shipments`} items={consignees.items} total={consignees.total} unit="shipments" />
        <TopBars order={2} loading={loading} color="#fbbf24" title="Most Frequent Notify Parties" note={`Top 3 of ${notifyParties.total} shipments`} items={notifyParties.items} total={notifyParties.total} unit="shipments" />
        <TopBars order={3} loading={loading} color="#fb7185" title="Most Frequent Email Senders" note={`Top 3 of ${senders.total} emails`} items={senders.items} total={senders.total} unit="emails" />
      </div>

      <div className="bars-grid">
        <GeoHeat order={0} loading={loading} palette={OUTBOUND} title="Outbound · Port of Loading" note={mapNote(outbound)} rows={outbound.rows} />
        <GeoHeat order={1} loading={loading} palette={INBOUND} title="Inbound · Port of Discharge" note={mapNote(inbound)} rows={inbound.rows} />
      </div>
    </div>
  );
}
