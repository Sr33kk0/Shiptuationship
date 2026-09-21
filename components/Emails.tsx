"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { paginate } from "@/lib/pagination";
import { CATS, dayKey, fmtDate, fmtTime, type Category, type Fields, type Shipment, type Side } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import DateRangePicker from "./DateRangePicker";
import ExportEmails from "./ExportEmails";
import { Icon } from "./Icon";
import Pagination from "./Pagination";
import Profile from "./Profile";
import ReviewModal from "./ReviewModal";
import SortSheet from "./SortSheet";
import { useToast } from "./Shell";

type Filter = "all" | Category;
type Sub = "all" | "needs-review" | "validated";
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

// c = idle text colour, a = active background
const FILTERS: { key: Filter; label: string; c: string; a: string; t?: string }[] = [
  { key: "all", label: "All", c: "var(--muted)", a: "var(--solid)", t: "var(--on-solid)" },
  { key: "document-comparison", label: "Comparisons", c: "#1d4ed8", a: "#2563eb" },
  { key: "new-si", label: "SI Requests", c: "#7e22ce", a: "#9333ea" },
  { key: "invoice", label: "Invoices", c: "#b45309", a: "#d97706" },
  { key: "general", label: "General", c: "#525252", a: "#334155" },
  { key: "spam", label: "Spam", c: "#be123c", a: "#e11d48" },
];

const SUBS: { key: Sub; c: string; a: string; t: string }[] = [
  { key: "all", c: "var(--muted)", a: "var(--edge)", t: "var(--ink)" },
  { key: "needs-review", c: "#e11d48", a: "#ffe4e6", t: "#9f1239" },
  { key: "validated", c: "#059669", a: "#d1fae5", t: "#065f46" },
];

const compare = (a: Shipment, b: Shipment, key: SortKey) => {
  const [x, y] = key === "rawDate" ? [a.at, b.at] : [a[key], b[key]]; // the Date column sorts by the full timestamp, so same-day emails keep their order
  return typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
};

export default function Emails() {
  const { shipments, setShipments, loadState, busy } = useShipments();
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  // Category and status live in the URL; legacy dashboard status links target Comparisons.
  const params = useSearchParams();
  const view = params.get("view") ?? "";
  const legacySub = view === "needs-review" || view === "validated" ? view : "all";
  const status = params.get("status") ?? legacySub;
  const sub: Sub = status === "needs-review" || status === "validated" ? status : "all";
  const filter: Filter = Object.keys(CATS).includes(view) ? (view as Category) : legacySub !== "all" ? "document-comparison" : "all";
  const [query, setQuery] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rawDate", dir: "desc" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false); // the sort sheet (phones and tablets)
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const table = useRef<HTMLDivElement>(null);

  // Every tab is a real link to its own address.
  const href = (f: Filter, s: Sub = sub) => {
    const search = new URLSearchParams();
    if (f !== "all") search.set("view", f);
    if (s !== "all") search.set("status", s);
    return search.size ? `/emails?${search}` : "/emails";
  };

  const toggleSort = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const categoryRows = shipments.filter((s) => filter === "all" || s.category === filter);
  const validated = categoryRows.filter((s) => s.status === "clean").length;
  const needsReview = categoryRows.filter((s) => s.status === "discrepancy").length;
  const count = (f: Filter) => (f === "all" ? shipments.length : shipments.filter((s) => s.category === f).length);

  const q = query.toLowerCase();
  const rows = shipments
    .filter((s) => {
      if (![s.subject, s.sender, s.id].some((v) => v.toLowerCase().includes(q))) return false;
      if (range.start && dayKey(s) < range.start) return false;
      if (range.end && dayKey(s) > range.end) return false;
      if (filter !== "all" && s.category !== filter) return false;
      if (sub === "needs-review") return s.status === "discrepancy";
      if (sub === "validated") return s.status === "clean";
      return true;
    })
    .sort((a, b) => (sort.dir === "desc" ? -1 : 1) * compare(a, b, sort.key));
  const paged = paginate(rows, page, limit);

  useEffect(() => setPage(1), [query, range.start, range.end, filter, sub, sort.key, sort.dir]);
  const goToPage = (next: number) => {
    setPage(next);
    table.current?.scrollTo({ top: 0 });
  };

  const selected = shipments.find((s) => s.id === openId) ?? null;
  // The modal steps through the list as currently filtered and sorted.
  const at = rows.findIndex((r) => r.id === openId);
  const go = (i: number) => () => setOpenId(rows[i].id);

  // Server runs the deterministic 7-field comparison and returns the updated shipment.
  // Without `fields` it marks the email as read instead.
  const save = async (s: Shipment, side?: Side, fields?: Fields) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(s.id)}/${fields ? "review" : "read"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, fields }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const updated: Shipment = await res.json();
      setShipments((all) => all.map((x) => (x.id === s.id ? updated : x)));
      showToast(fields ? `Saved verified ${side!.toUpperCase()} fields for ${s.id}` : `Marked ${s.id} as read`);
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
          <h1>Emails</h1>
          <p>Incoming email queue with category filters, search, and review.</p>
        </div>
        <Profile />
      </header>

      <section className="queue fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <div className="toolbar">
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

            <DateRangePicker value={range} onChange={setRange} />
            <ExportEmails rows={rows} disabled={loadState !== "ready" || saving || rows.length === 0} />
          </div>

          <div className="filters">
            {FILTERS.map((f) => (
              <Link key={f.key} href={href(f.key)} replace scroll={false} className="filter" aria-current={filter === f.key ? "page" : undefined} style={{ "--c": f.c, "--a": f.a, "--t": f.t } as React.CSSProperties}>
                {f.label}
                {loadState !== "loading" && ` (${count(f.key)})`}
                {shipments.some((s) => (f.key === "all" || s.category === f.key) && s.status === "discrepancy") && <span className="dot" role="img" aria-label="Needs Review" />}
              </Link>
            ))}
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

          <div className="substatus">
              <span>Status:</span>
              {SUBS.map((s) => (
                <Link key={s.key} href={href(filter, s.key)} replace scroll={false} className="sub" aria-current={sub === s.key ? "page" : undefined} style={{ "--c": s.c, "--a": s.a, "--t": s.t } as React.CSSProperties}>
                  {s.key === "needs-review" && <span className="dot" />}
                  {s.key === "validated" && <Icon d="check" size={14} sw={2.2} />}
                  {s.key === "all" ? "All" : s.key === "validated" ? "Validated" : "Needs Review"}
                  {loadState !== "loading" && ` (${s.key === "all" ? categoryRows.length : s.key === "validated" ? validated : needsReview})`}
                </Link>
              ))}
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
            {/* keyed by tab so switching tabs replays the cascade; re-sorting replays it too (moved rows are re-inserted), typing and the 30s refresh do not */}
            <tbody key={`${view}:${sub}`}>
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
          onSave={(side, fields) => save(selected, side, fields)}
          onMarkRead={() => save(selected)}
          onToast={showToast}
          onPrev={at > 0 ? go(at - 1) : undefined}
          onNext={at >= 0 && at < rows.length - 1 ? go(at + 1) : undefined}
        />
      )}
    </div>
  );
}
