"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BOT_NAME, KINDS, SOURCES, type AuditEvent, type AuditSource } from "@/lib/audit";
import FilterMenu, { type FilterOption } from "./FilterMenu";
import { Icon } from "./Icon";
import Profile from "./Profile";

const p2 = (n: number) => String(n).padStart(2, "0");
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const clock = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
};
// "Today" / "Yesterday" / dd/mm/yy, in the viewer's time zone (the same date format as the Emails page)
const dayLabel = (key: string) => {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const k = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  if (key === k(now)) return "Today";
  if (key === k(yesterday)) return "Yesterday";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
// a stable colour per person, so the same moderator always gets the same avatar
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const OUTCOME: Record<string, { label: string; c: string; bg: string }> = {
  cleared: { label: "Validated", c: "#047857", bg: "#ecfdf5" },
  flagged: { label: "Needs review", c: "#be123c", bg: "#fff1f2" },
  incomplete: { label: "Incomplete", c: "#525252", bg: "#f5f5f5" },
};

function verb(e: AuditEvent) {
  if (e.kind === "classified") return <>classified <b className="ev-id">{e.emailId}</b> as <b>{e.detail || "Unknown"}</b></>;
  if (e.kind === "compared") return <>ran the SI / BL comparison on <b className="ev-id">{e.emailId}</b></>;
  if (e.kind === "review_saved") return <>saved verified {e.detail ? `${e.detail} ` : ""}fields on <b className="ev-id">{e.emailId}</b></>;
  return <>marked <b className="ev-id">{e.emailId}</b> as read</>;
}

export default function AuditLog({ source }: { source: AuditSource }) {
  const { title, blurb, kinds } = SOURCES[source];
  const params = useSearchParams();
  const action = kinds.find((k) => k === params.get("action")) ?? "";
  const user = params.get("user") ?? "";
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Same idea as the Emails page: fetch once, then poll, so new activity shows up without a reload.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/audit?source=${source}`);
        if (!res.ok) throw new Error(await res.text());
        const data: AuditEvent[] = await res.json();
        if (!alive) return;
        setEvents(data);
        setState("ready");
      } catch {
        if (alive) setState((s) => (s === "ready" ? s : "error"));
      }
    };
    load();
    const poll = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, [source]);

  // Both filters live in the address bar, like the Emails tabs: /audit/user?action=review_saved&user=Daniel%20Ho
  const href = (a: string, u: string) => {
    const q = new URLSearchParams();
    if (a) q.set("action", a);
    if (u) q.set("user", u);
    return q.size ? `/audit/${source}?${q}` : `/audit/${source}`;
  };

  const users = [...new Set(events.map((e) => e.actor))].sort((a, b) => a.localeCompare(b));
  const ready = state === "ready";
  // each dropdown counts what it would show given the other one's choice
  const actionOptions: FilterOption[] = [
    { key: "", label: "All actions", href: href("", user), count: ready ? events.filter((e) => !user || e.actor === user).length : undefined },
    ...kinds.map((k) => ({ key: k, label: KINDS[k].label, color: KINDS[k].color, href: href(k, user), count: ready ? events.filter((e) => e.kind === k && (!user || e.actor === user)).length : undefined })),
  ];
  const userOptions: FilterOption[] = [
    { key: "", label: "All users", href: href(action, ""), count: ready ? events.filter((e) => !action || e.kind === action).length : undefined },
    ...users.map((u) => ({ key: u, label: u, href: href(action, u), count: ready ? events.filter((e) => e.actor === u && (!action || e.kind === action)).length : undefined })),
  ];

  const rows = events.filter((e) => (!action || e.kind === action) && (!user || e.actor === user));

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  // events arrive newest first, so a new day starts wherever the calendar day changes
  let lastDay = "";

  return (
    <div className="scroll">
      <header className="page-head fade-up">
        <div>
          <h1>{title}</h1>
          <p>{blurb}</p>
        </div>
        <Profile />
      </header>

      <section className="queue fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <div className="toolbar">
          <div className="dd-row">
            <FilterMenu title="Action" value={action} options={actionOptions} />
            {source === "user" && <FilterMenu title="User" value={user} options={userOptions} />}
          </div>
        </div>

        <div className="table-wrap">
          <ol className="log" key={`${source}|${action}|${user}`}>
            {state === "loading" &&
              Array.from({ length: 7 }, (_, i) => (
                <li key={i} className="ev skel-row" aria-hidden="true">
                  <span className="skel ev-ph" />
                  <div className="ev-main">
                    <span className="skel" style={{ width: `${45 + ((i * 17) % 30)}%`, marginBottom: 8 }} />
                    <span className="skel" style={{ width: `${30 + ((i * 11) % 25)}%` }} />
                  </div>
                </li>
              ))}
            {state === "error" && <li className="log-empty">Could not load the audit log from Firestore.</li>}
            {state === "ready" && rows.length === 0 && <li className="log-empty">No log entries match your filters.</li>}
            {rows.map((e, i) => {
              const day = dayOf(e.at);
              const divider = day !== lastDay ? ((lastDay = day), true) : false;
              const kind = KINDS[e.kind];
              const outcome = OUTCOME[e.kind === "review_saved" ? e.outcome : e.kind === "compared" ? e.detail : ""];
              const expandable = e.changes.length > 0;
              const expanded = open.has(e.id);
              return (
                <li key={e.id} className="ev-item" style={{ "--d": `${Math.min(i, 14) * 0.03}s` } as React.CSSProperties}>
                  {divider && <div className="day"><span>{dayLabel(day)}</span></div>}
                  <div className="ev">
                    <div className="ev-avatar" style={e.bot ? undefined : ({ "--h": hue(e.actor) } as React.CSSProperties)} data-bot={e.bot || undefined}>
                      {e.bot ? <img src="/shiplogo.svg" alt="" /> : initials(e.actor)}
                      <span className="ev-badge" style={{ background: kind.color }} title={kind.label}>
                        <Icon d={kind.icon} size={10} sw={3} />
                      </span>
                    </div>
                    <div className="ev-main">
                      <div className="ev-top">
                        <span className="ev-who">
                          <b>{e.bot ? BOT_NAME : e.actor}</b>
                          {e.bot && <span className="bot">BOT</span>}
                        </span>
                        <span className="ev-text">{verb(e)}</span>
                        {outcome && <span className="ev-pill" style={{ color: outcome.c, background: outcome.bg }}>{outcome.label}</span>}
                        <time className="ev-time" dateTime={e.at} title={`${dayLabel(day)} ${clock(e.at)}`}>{clock(e.at)}</time>
                      </div>
                      {e.subject && <div className="ev-sub trunc">{e.subject}</div>}
                      {expandable && (
                        <button className="ev-toggle" onClick={() => toggle(e.id)} aria-expanded={expanded}>
                          <Icon d={expanded ? "chevD" : "chevR"} size={12} sw={2.4} />
                          {e.changes.length} field {e.changes.length === 1 ? "change" : "changes"}
                        </button>
                      )}
                      {expandable && expanded && (
                        <dl className="ev-embed" style={{ "--k": kind.color } as React.CSSProperties}>
                          {e.changes.map((c) => (
                            <div key={c.field}>
                              <dt>{c.field}</dt>
                              <dd>
                                <del>{c.before || "empty"}</del>
                                <span aria-hidden="true">→</span>
                                <ins>{c.after || "empty"}</ins>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </div>
  );
}
