"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { fmtWhen, voyageKey, type Shipment } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import Emails from "./Emails";
import { Icon } from "./Icon";
import Profile from "./Profile";
import { NavLink } from "./Shell";

// /shipments lists the voyages; /shipments?voyage=NAP%20914%20V.BS007 is one voyage's page (its route on a globe, then its emails).
export default function Shipments() {
  const voyage = useSearchParams().get("voyage");
  return voyage ? <Emails voyage={voyage} /> : <ShipmentList />;
}

// One row per vessel + voyage (read from each email's subject or body), newest activity first.
function ShipmentList() {
  const { shipments, loadState } = useShipments();
  const [query, setQuery] = useState("");

  const groups = new Map<string, Shipment[]>();
  for (const s of shipments) {
    const key = voyageKey(s);
    if (key) groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const q = query.toLowerCase();
  const rows = [...groups]
    .filter(([key]) => key.toLowerCase().includes(q))
    .map(([key, emails]) => ({ key, emails: emails.sort((a, b) => b.at.localeCompare(a.at)) }))
    .sort((a, b) => b.emails[0].at.localeCompare(a.emails[0].at));

  return (
    <div className="scroll">
      <header className="page-head fade-up">
        <div>
          <h1>Shipments</h1>
          <p>Emails grouped by vessel name and voyage number.</p>
        </div>
        <Profile />
      </header>

      <section className="queue fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <div className="toolbar">
          <div className="search">
            <Icon d="search" />
            <input type="text" placeholder="Search by vessel or voyage..." aria-label="Search shipments" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button className="clear" onClick={() => setQuery("")} title="Clear search" aria-label="Clear search">
                <Icon d="x" size={14} sw={2} />
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <ul className="ships">
            {loadState === "loading" &&
              rows.length === 0 &&
              Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="ship-skel skel-row" aria-hidden="true">
                  <span className="skel" style={{ width: `${30 + ((i * 13) % 30)}%` }} />
                </li>
              ))}
            {loadState !== "loading" && rows.length === 0 && (
              <li className="log-empty">{loadState === "error" ? "Could not load shipments from Firestore." : "No shipments match your search."}</li>
            )}
            {rows.map(({ key, emails }, i) => {
              const [latest] = emails;
              const review = emails.filter((s) => s.status === "discrepancy").length;
              return (
                <li key={key} style={{ "--d": `${Math.min(i, 14) * 0.03}s` } as React.CSSProperties}>
                  <NavLink className="ship" href={`/shipments?voyage=${encodeURIComponent(key)}`}>
                    <span className="ship-ic">
                      <Icon d="ship" size={18} />
                    </span>
                    <span className="ship-name">
                      <b>{latest.vessel}</b>
                      <span className="ship-voy">Voyage {latest.voyage}</span>
                    </span>
                    {review > 0 && (
                      <span className="status rose">
                        <span className="dot" />
                        {review} Needs Review
                      </span>
                    )}
                    <span className="ship-meta muted">
                      <b>{emails.length}</b> {emails.length === 1 ? "email" : "emails"}
                      <small>{fmtWhen(latest)}</small>
                    </span>
                    <span className="ship-chev">
                      <Icon d="chevR" size={14} sw={2} />
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
