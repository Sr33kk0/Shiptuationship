"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { paginate } from "@/lib/pagination";
import { legColor, legKey, portName, voyageLegs } from "@/lib/ports";
import { CATS, dayKey, fmtDate, fmtTime, voyageKey, type Category, type Edits, type Shipment } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import DateRangePicker from "./DateRangePicker";
import ExportEmails from "./ExportEmails";
import FilterMenu, { type FilterOption } from "./FilterMenu";
import { Icon } from "./Icon";
import Pagination from "./Pagination";
import Profile, { useMe } from "./Profile";
import ReviewModal from "./ReviewModal";
import SortSheet from "./SortSheet";
import { useToast } from "./Shell";
import VoyageGlobe from "./VoyageGlobe";

type Filter = "all" | Category;
type Sub = "all" | "needs-review" | "validated";
type Seen = "all" | "unread" | "read";
type SortKey = "id" | "subject" | "sender" | "category" | "rawDate" | "attachmentCount" | "status";

const COLS: [SortKey, string][] = [
  ["id", "Email #"],
  ["subject", "Subject / Message"],
  ["sender", "Sender Email"],
  ["category", "Category"],
  ["rawDate", "Date"],
  ["attachmentCount", "Attachments"],
  ["status", "Status"],
];

const FILTERS: Filter[] = ["all", ...(Object.keys(CATS) as Category[])];
const SUBS: { key: Sub; label: string; color?: string }[] = [
  { key: "all", label: "All statuses" },
  { key: "needs-review", label: "Needs Review", color: "#e11d48" },
  { key: "validated", label: "Validated", color: "#059669" },
];
const SEENS: { key: Seen; label: string; color?: string }[] = [
  { key: "all", label: "All emails" },
  { key: "unread", label: "Unread", color: "var(--blue)" },
  { key: "read", label: "Read" },
];

const inCat = (s: Shipment, f: Filter) => f === "all" || s.category === f;
const inSub = (s: Shipment, v: Sub) => v === "all" || s.status === (v === "needs-review" ? "discrepancy" : "clean");
const inSeen = (s: Shipment, r: Seen) => r === "all" || s.isRead === (r === "read");

const compare = (a: Shipment, b: Shipment, key: SortKey) => {
  const [x, y] = key === "rawDate" ? [a.at, b.at] : [a[key], b[key]]; // the Date column sorts by the full timestamp, so same-day emails keep their order
  return typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
};

// With `voyage` ("NAP 914 V.BS007") this is that voyage's page, opened from Shipments: its route on a globe, then only its emails.
export default function Emails({ voyage }: { voyage?: string }) {
  const { shipments, setShipments, loadState, busy } = useShipments();
  const inVoyage = voyage ? shipments.filter((s) => voyageKey(s) === voyage) : shipments;
  // A voyage's page can narrow the list to one leg, picked beside the globe.
  const [route, setRoute] = useState<string | null>(null);
  const legs = voyage ? voyageLegs(inVoyage) : [];
  const legAt = legs.findIndex((l) => legKey(l) === route);
  const leg = legs[legAt];
  const pool = leg ? inVoyage.filter((s) => leg.emails.includes(s.id)) : inVoyage;
  const showToast = useToast();
  const me = useMe();
  const [saving, setSaving] = useState(false);
  // Category, status and read state live in the URL; legacy dashboard status links target Comparisons.
  const params = useSearchParams();
  const view = params.get("view") ?? "";
  const legacySub = view === "needs-review" || view === "validated" ? view : "all";
  const status = params.get("status") ?? legacySub;
  const sub: Sub = status === "needs-review" || status === "validated" ? status : "all";
  const filter: Filter = Object.keys(CATS).includes(view) ? (view as Category) : legacySub !== "all" ? "document-comparison" : "all";
  const seenParam = params.get("read");
  const seen: Seen = seenParam === "unread" || seenParam === "read" ? seenParam : "all";
  const [query, setQuery] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rawDate", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(params.get("open")); // /emails?open=email_070 opens that email
  const [sortOpen, setSortOpen] = useState(false); // the sort sheet (phones and tablets)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const table = useRef<HTMLDivElement>(null);

  // Every filter option is a real link to its own address, like the audit logs: /emails?view=invoice&status=validated&read=unread
  const href = (f: Filter = filter, s: Sub = sub, r: Seen = seen) => {
    const search = new URLSearchParams(voyage ? { voyage } : {});
    if (f !== "all") search.set("view", f);
    if (s !== "all") search.set("status", s);
    if (r !== "all") search.set("read", r);
    const path = voyage ? "/shipments" : "/emails";
    return search.size ? `${path}?${search}` : path;
  };

  const toggleSort = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  // each dropdown counts what it would show given the other two choices
  const count = (f: Filter = filter, s: Sub = sub, r: Seen = seen) =>
    loadState === "loading" ? undefined : pool.filter((x) => inCat(x, f) && inSub(x, s) && inSeen(x, r)).length;
  const catOptions: FilterOption[] = FILTERS.map((f) => ({
    key: f,
    label: f === "all" ? "All categories" : CATS[f].label,
    color: f === "all" ? undefined : CATS[f].color,
    href: href(f),
    count: count(f),
  }));
  const subOptions: FilterOption[] = SUBS.map((s) => ({ ...s, href: href(filter, s.key), count: count(filter, s.key) }));
  const seenOptions: FilterOption[] = SEENS.map((r) => ({ ...r, href: href(filter, sub, r.key), count: count(filter, sub, r.key) }));

  const q = query.toLowerCase();
  const rows = pool
    .filter((s) => {
      if (![s.subject, s.sender, s.id].some((v) => v.toLowerCase().includes(q))) return false;
      if (range.start && dayKey(s) < range.start) return false;
      if (range.end && dayKey(s) > range.end) return false;
      return inCat(s, filter) && inSub(s, sub) && inSeen(s, seen);
    })
    .sort((a, b) => (sort.dir === "desc" ? -1 : 1) * compare(a, b, sort.key));
  const paged = paginate(rows, page, limit);

  useEffect(() => setPage(1), [query, range.start, range.end, filter, sub, seen, sort.key, sort.dir, route]);
  const goToPage = (next: number) => {
    setPage(next);
    table.current?.scrollTo({ top: 0 });
  };

  const selected = shipments.find((s) => s.id === openId) ?? null;
  // The modal steps through the list as currently filtered and sorted.
  const at = rows.findIndex((r) => r.id === openId);
  const go = (i: number) => () => setOpenId(rows[i].id);

  // Server runs the deterministic 7-field comparison and returns the updated shipment.
  // Saves the SI and BL together; without `edits` it marks the email as read, or with `clear` validates a flagged email that has no comparison.
  const save = async (s: Shipment, edits?: Edits, clear?: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(s.id)}/${clear ? "clear" : edits ? "review" : "read"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edits ?? {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const updated: Shipment = await res.json();
      setShipments((all) => all.map((x) => (x.id === s.id ? updated : x)));
      showToast(clear ? `Cleared ${s.id}` : edits ? `Saved verified SI and BL fields for ${s.id}` : `Marked ${s.id} as read`);
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="scroll">
      <header className="page-head fade-up">
        <div>
          {voyage && (
            <Link href="/shipments" className="back-link">
              <Icon d="chevL" size={14} sw={2} />
              Shipments
            </Link>
          )}
          <h1>{voyage ?? "Emails"}</h1>
          <p>{voyage ? "Where this voyage sails, and every email about it." : "Incoming email queue with category filters, search, and review."}</p>
        </div>
        <Profile />
      </header>

      {voyage && <VoyageGlobe legs={legs} loading={loadState === "loading"} selected={leg ? route : null} onSelect={setRoute} />}

      <section className="queue fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <div className="toolbar">
          {leg && (
            <div className="leg-filter">
              <span>Leg:</span>
              <button onClick={() => setRoute(null)} title="Show every email of this voyage" aria-label={`Clear the leg filter ${portName(leg.pol)} to ${portName(leg.pod)}`}>
                <i className="legend-dot" style={{ background: legColor(legAt) }} />
                {portName(leg.pol)} → {portName(leg.pod)}
                <Icon d="x" size={12} sw={2.2} />
              </button>
            </div>
          )}
          <div className="toolbar-row">
            <div className="search">
              <Icon d="search" />
              <input type="text" placeholder="Search by Email #, subject, sender..." aria-label="Search emails" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button className="clear" onClick={() => setQuery("")} title="Clear search" aria-label="Clear search">
                  <Icon d="x" size={14} sw={2} />
                </button>
              )}
            </div>

            <div className="dd-row">
              <FilterMenu title="Category" value={filter} options={catOptions} />
              <FilterMenu title="Status" value={sub} options={subOptions} />
              <FilterMenu title="Read/Unread" value={seen} options={seenOptions} />
            </div>

            <DateRangePicker value={range} onChange={setRange} />
            <ExportEmails rows={rows} disabled={loadState !== "ready" || saving || rows.length === 0} />
          </div>

          {/* the column headers double as sort buttons on wide screens; on phones they are hidden, so sorting moves here */}
          <div className="sortbar">
            <button className="sort-trigger" onClick={() => setSortOpen(true)} aria-haspopup="dialog" aria-expanded={sortOpen}>
              <Icon d="sortNone" size={16} sw={2} />
              <span className="sort-trigger-label">Sort by</span>
              <b>{COLS.find(([key]) => key === sort.key)?.[1]}</b>
              <small>{sort.dir === "asc" ? "Ascending" : "Descending"}</small>
              <Icon d="chevD" size={14} sw={2} />
            </button>
            <SortSheet open={sortOpen} options={COLS} value={sort.key} dir={sort.dir} onChange={(key, dir) => setSort({ key, dir })} onClose={() => setSortOpen(false)} />
          </div>
        </div>

        <div className="table-wrap" ref={table}>
          <table>
            <thead>
              <tr>
                {COLS.map(([key, label]) => {
                  const active = sort.key === key;
                  return (
                    <th key={key} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      <button className="th-btn" onClick={() => toggleSort(key)}>
                        {label}
                        <Icon d={active ? (sort.dir === "asc" ? "sortAsc" : "sortDesc") : "sortNone"} size={14} sw={active ? 2.5 : 2} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {/* keyed by filter so switching filters replays the cascade; re-sorting replays it too (moved rows are re-inserted), typing and the 30s refresh do not */}
            <tbody key={`${view}:${sub}:${seen}`}>
              {loadState === "loading" &&
                rows.length === 0 &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sk${i}`} className="skel-row" aria-hidden="true" style={{ "--d": `${i * 0.04}s` } as React.CSSProperties}>
                    {[56, 230, 170, 100, 80, 120, 84].map((w, j) => (
                      <td key={j}>
                        <span className="skel" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {rows.length === 0 && loadState !== "loading" && (
                <tr className="empty">
                  <td colSpan={7}>
                    {loadState === "error" ? "Could not load shipments from Firestore." : "No shipments match your filter criteria."}
                  </td>
                </tr>
              )}
              {paged.items.map((s, i) => {
                const cat = CATS[s.category];
                return (
                  <tr
                    key={s.id}
                    className={s.isRead ? "read" : "unread"}
                    tabIndex={0}
                    onClick={() => setOpenId(s.id)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setOpenId(s.id);
                      }
                    }}
                    style={{ "--d": `${i * 0.04}s` } as React.CSSProperties}
                  >
                    <td className="id">
                      <span className={`rs${s.isRead ? "" : " on"}`} role="img" aria-label={s.isRead ? "Read" : "Unread"} title={s.isRead ? "Read" : "Unread"} />
                      {s.id}
                    </td>
                    <td className="subject">
                      <span title={s.subject}>{s.subject}</span>
                    </td>
                    <td className="sender">{s.sender}</td>
                    <td className="cat">
                      <span className="tag" style={{ color: cat.color, background: cat.bg }}>
                        {cat.label}
                      </span>
                    </td>
                    <td className="muted date">
                      <span className="d">{fmtDate(s)}</span>
                      {fmtTime(s) && <span className="t">{fmtTime(s)}</span>}
                    </td>
                    <td className="atts">
                      {s.attachmentCount > 0 ? (
                        <div className="att">
                          <Icon d="clip" size={14} />
                          <span className="trunc">{s.attachmentNames[0]}</span>
                          {s.attachmentCount > 1 && <b>+{s.attachmentCount - 1}</b>}
                        </div>
                      ) : (
                        <span className="none">—</span>
                      )}
                    </td>
                    <td className="stat">
                      {s.status === "discrepancy" && (
                        <span className="status rose" title={s.reviewReasons.join('\n')}>
                          <span className="dot" />
                          Needs Review
                        </span>
                      )}
                      {s.status === "clean" && (
                        <span className="status green">
                          <Icon d="check" size={14} sw={2.2} />
                          Validated
                        </span>
                      )}
                      {s.status === "pending" && <span className="muted">Received</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination {...paged} total={rows.length} limit={limit} onPage={goToPage} onLimit={(size) => { setLimit(size); goToPage(1); }} />
      </section>

      {selected && (
        <ReviewModal
          shipment={selected}
          onClose={() => setOpenId(null)}
          saving={saving}
          onSave={(edits) => save(selected, edits)}
          onMarkRead={() => save(selected)}
          onClear={() => save(selected, undefined, true)}
          onToast={showToast}
          readOnly={me.role !== "moderator"}
          onPrev={at > 0 ? go(at - 1) : undefined}
          onNext={at >= 0 && at < rows.length - 1 ? go(at + 1) : undefined}
        />
      )}
    </div>
  );
}
