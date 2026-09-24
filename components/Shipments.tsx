"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { voyageLegs } from "@/lib/ports";
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
          <p>Emails grouped by vessel name and number.</p>
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
              const routes = voyageLegs(emails).length; // the same legs the voyage's globe draws
              return (
                <li key={key} style={{ "--d": `${Math.min(i, 14) * 0.03}s` } as React.CSSProperties}>
                  <NavLink className="ship" href={`/shipments?voyage=${encodeURIComponent(key)}`}>
                    <span className="ship-ic">
                      {/* Ionicons boat-outline */}
                      <svg width={18} height={18} viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M461.93 261.05c-2-4.76-6.71-7.83-11.67-9.49l-187.18-74.48a23.78 23.78 0 00-14.17 0l-187 74.52c-5 1.56-9.83 4.77-11.81 9.53s-2.94 9.37-1 15.08l46.53 119.15a7.46 7.46 0 007.47 4.64c26.69-1.68 50.31-15.23 68.38-32.5a7.66 7.66 0 0110.49 0C201.29 386 227 400 256 400s54.56-14 73.88-32.54a7.67 7.67 0 0110.5 0c18.07 17.28 41.69 30.86 68.38 32.54a7.45 7.45 0 007.46-4.61l46.7-119.16c1.98-4.78.99-10.41-.99-15.18z" strokeLinecap="butt" strokeLinejoin="miter" />
                        <path d="M416 473.14a6.84 6.84 0 00-3.56-6c-27.08-14.55-51.77-36.82-62.63-48a10.05 10.05 0 00-12.72-1.51c-50.33 32.42-111.61 32.44-161.95.05a10.09 10.09 0 00-12.82 1.56c-10.77 11.28-35.19 33.3-62.43 47.75a7.15 7.15 0 00-3.89 5.73 6.73 6.73 0 007.92 7.15c20.85-4.18 41-13.68 60.2-23.83a8.71 8.71 0 018-.06A185.14 185.14 0 00340 456a8.82 8.82 0 018.09.06c19.1 10 39.22 19.59 60 23.8a6.72 6.72 0 007.95-6.71z" fill="currentColor" stroke="none" />
                        <path d="M320 96V72a24.07 24.07 0 00-24-24h-80a24.07 24.07 0 00-24 24v24M416 233v-89a48.14 48.14 0 00-48-48H144a48.14 48.14 0 00-48 48v92M256 183.6v212.85" />
                      </svg>
                    </span>
                    <span className="ship-name">
                      <b>{latest.vessel}</b>
                      <span className="ship-voy">Vessel {latest.voyage}</span>
                    </span>
                    {review > 0 && (
                      <span className="status rose">
                        <span className="dot" />
                        {review} Needs Review
                      </span>
                    )}
                    <span className="ship-meta muted">
                      <b>{emails.length}</b> {emails.length === 1 ? "email" : "emails"} · <b>{routes}</b> {routes === 1 ? "route" : "routes"}
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
