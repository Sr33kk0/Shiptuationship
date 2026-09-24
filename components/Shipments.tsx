"use client";

import { useState } from "react";
import { CATS, fmtWhen, type Shipment } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import { Icon } from "./Icon";
import Profile from "./Profile";
import { NavLink } from "./Shell";

// One row per vessel + voyage (read from each email's subject or body), newest activity first.
// Opening a row lists its emails; each one opens in the Emails review.
export default function Shipments() {
  const { shipments, loadState } = useShipments();
  const [query, setQuery] = useState("");

  const groups = new Map<string, Shipment[]>();
  for (const s of shipments) {
    if (!s.voyage) continue;
    const key = `${s.vessel} V.${s.voyage}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
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
                  <details className="ship">
                    <summary>
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
                        <Icon d="chevD" size={14} sw={2} />
                      </span>
                    </summary>
                    <ul className="ship-emails">
                      {emails.map((s) => (
                        <li key={s.id}>
                          <NavLink href={`/emails?open=${encodeURIComponent(s.id)}`}>
                            <span className="id">{s.id}</span>
                            <span className="subj trunc" title={s.subject}>{s.subject}</span>
                            <span className="tag" style={{ color: CATS[s.category].color, background: CATS[s.category].bg }}>{CATS[s.category].label}</span>
                            <span className="when muted">{fmtWhen(s)}</span>
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
