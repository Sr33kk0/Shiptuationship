"use client";

import { useEffect, useRef, useState } from "react";
import { CATS, type Category, type Fields, type Shipment } from "@/lib/shipments";
import { Icon } from "./Icon";
import ReviewModal from "./ReviewModal";

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
const FILTERS: { key: Filter; label: string; c: string; a: string }[] = [
  { key: "all", label: "All", c: "#737373", a: "#0f172a" },
  { key: "document-comparison", label: "Comparisons", c: "#1d4ed8", a: "#2563eb" },
  { key: "new-si", label: "SI Requests", c: "#7e22ce", a: "#9333ea" },
  { key: "invoice", label: "Invoices", c: "#b45309", a: "#d97706" },
  { key: "general", label: "General", c: "#525252", a: "#334155" },
  { key: "other", label: "Other", c: "#be123c", a: "#e11d48" },
];

const SUBS: { key: Sub; c: string; a: string; t: string }[] = [
  { key: "all", c: "#737373", a: "#e5e5e5", t: "#0f172a" },
  { key: "needs-review", c: "#e11d48", a: "#ffe4e6", t: "#9f1239" },
  { key: "validated", c: "#059669", a: "#d1fae5", t: "#065f46" },
];

const compare = (a: Shipment, b: Shipment, key: SortKey) => {
  const x = a[key];
  const y = b[key];
  return typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
};

export default function Dashboard() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<Filter>("all");
  const [sub, setSub] = useState<Sub>("all");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rawDate", dir: "desc" });
  const [collapsed, setCollapsed] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // ponytail: 30s poll; swap for SSE/onSnapshot if latency matters.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/emails");
        if (!res.ok) throw new Error(await res.text());
        const data: Shipment[] = await res.json();
        if (!alive) return;
        setShipments(data);
        setLoadState("ready");
      } catch {
        if (alive) setLoadState((s) => (s === "ready" ? s : "error"));
      }
    };
    load();
    const poll = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const pick = (f: Filter) => {
    setFilter(f);
    if (f !== "document-comparison") setSub("all");
  };

  const toggleSort = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const cmp = shipments.filter((s) => s.category === "document-comparison");
  const validated = cmp.filter((s) => s.status === "clean").length;
  const needsReview = cmp.filter((s) => s.status === "discrepancy").length;
  const matchRate = Math.round((validated / cmp.length) * 100);
  const count = (f: Filter) => (f === "all" ? shipments.length : shipments.filter((s) => s.category === f).length);

  const q = query.toLowerCase();
  const rows = shipments
    .filter((s) => {
      if (![s.subject, s.sender, s.id].some((v) => v.toLowerCase().includes(q))) return false;
      if (range.start && s.rawDate < range.start) return false;
      if (range.end && s.rawDate > range.end) return false;
      if (filter !== "all" && s.category !== filter) return false;
      if (filter === "document-comparison") {
        if (sub === "needs-review") return s.status === "discrepancy";
        if (sub === "validated") return s.status === "clean";
      }
      return true;
    })
    .sort((a, b) => (sort.dir === "desc" ? -1 : 1) * compare(a, b, sort.key));

  const selected = shipments.find((s) => s.id === openId) ?? null;

  // Server runs the deterministic 7-field comparison and returns the updated shipment.
  const save = async (s: Shipment, fields: Fields) => {
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(s.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const updated: Shipment = await res.json();
      setShipments((all) => all.map((x) => (x.id === s.id ? updated : x)));
      showToast(`Saved verified fields for ${s.id}`);
    } catch (e) {
      showToast(`Save failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className={`shell${collapsed ? " collapsed" : ""}`}>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-ic">
            <Icon d="check" size={14} sw={2.2} />
          </span>
          {toast}
        </div>
      )}

      <aside className="sidebar">
        <div className="sb-body">
          <div className="sb-head">
            <div className="brand">
              <div className="logo">
                <Icon d="ship" size={20} />
              </div>
              {!collapsed && (
                <div style={{ minWidth: 0 }}>
                  <h2 className="trunc">Skymetrics</h2>
                  <small className="trunc">Ocean Manifest Desk</small>
                </div>
              )}
            </div>
            <button className="icon-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <Icon d={collapsed ? "expand" : "collapse"} sw={2} />
            </button>
          </div>

          <div className="sb-group">
            {!collapsed && <span className="sb-label">Menu</span>}
            <nav className="sb-nav">
              <button className={`nav-item primary${atTop ? " active" : ""}`} onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} title="Dashboard Overview">
                <span className="nav-dot" />
                {!collapsed && <span>Dashboard Overview</span>}
              </button>
            </nav>
          </div>

          <div className="sb-group">
            {!collapsed && <span className="sb-label">System &amp; Rules</span>}
            <nav className="sb-nav">
              {(
                [
                  ["Shipment Logs", "doc", "Audit logs in live sync."],
                  ["Carrier Directory", "ship", "Carrier Directory: Maersk, MSC, Cosco connected."],
                  ["Matching Rules", "filter", "Tolerance Rules: Gross weight ±50kg, container count exact match."],
                ] as const
              ).map(([label, icon, msg]) => (
                <button key={label} className="nav-item" onClick={() => showToast(msg)} title={label}>
                  {collapsed ? (
                    <Icon d={icon} />
                  ) : (
                    <>
                      <span>{label}</span>
                      <Icon d="chevR" sw={2} />
                    </>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="profile">
          <div className="avatar">DH</div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <h4 className="trunc">Daniel Ho</h4>
              <small className="trunc">Verification Officer</small>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <div className="scroll" ref={scrollRef} onScroll={(e) => setAtTop(e.currentTarget.scrollTop < e.currentTarget.clientHeight * 0.4)}>
          <header className="page-head">
            <div>
              <h1>Dashboard Overview</h1>
              <p>Ocean document intake, automated cross-verification, and discrepancy desk.</p>
            </div>
            <div className="pill">
              <Icon d="cal" size={14} />
              <span>This Month</span>
              <Icon d="chevD" size={12} sw={2} />
            </div>
          </header>

          <div className="cards">
            <div className="card">
              <div>
                <div className="card-top">
                  <span className="card-title">Comparison Requests</span>
                </div>
                <div className="big">{cmp.length}</div>
              </div>
              <div className="card-foot">
                <span>High-volume intake stream</span>
              </div>
            </div>

            <div className="card">
              <div>
                <div className="card-top">
                  <span className="card-title">Validated</span>
                  {cmp.length > 0 && <span className="badge green">{matchRate}% Match</span>}
                </div>
                <div className="big">{validated}</div>
              </div>
              <div className="card-foot">
                <span>Auto-cleared manifest checks</span>
              </div>
            </div>

            <div className="card">
              <div>
                <div className="card-top">
                  <span className="card-title">Needs Review</span>
                  <span className="badge rose">
                    <span className="dot" />
                    Action Required
                  </span>
                </div>
                <div className="big">{needsReview}</div>
              </div>
              <div className="card-foot">
                <span>Flagged for operator review</span>
                <b style={{ color: "#e11d48" }}>{needsReview} Pending</b>
              </div>
            </div>
          </div>

          <section className="queue">
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

                <div className="daterange">
                  <Icon d="cal" size={14} />
                  <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} title="Start date" aria-label="Start date" />
                  <span>to</span>
                  <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} title="End date" aria-label="End date" />
                  {(range.start || range.end) && (
                    <button className="clear inline" onClick={() => setRange({ start: "", end: "" })} title="Clear date range" aria-label="Clear date range">
                      <Icon d="x" size={14} sw={2} />
                    </button>
                  )}
                </div>
              </div>

              <div className="filters">
                {FILTERS.map((f) => (
                  <button key={f.key} className="filter" aria-pressed={filter === f.key} onClick={() => pick(f.key)} style={{ "--c": f.c, "--a": f.a } as React.CSSProperties}>
                    {f.label} ({count(f.key)})
                    {f.key === "document-comparison" && needsReview > 0 && <span className="dot" />}
                  </button>
                ))}
              </div>

              {filter === "document-comparison" && (
                <div className="substatus">
                  <span>Status:</span>
                  {SUBS.map((s) => (
                    <button key={s.key} className="sub" aria-pressed={sub === s.key} onClick={() => setSub(s.key)} style={{ "--c": s.c, "--a": s.a, "--t": s.t } as React.CSSProperties}>
                      {s.key === "needs-review" && <span className="dot" />}
                      {s.key === "validated" && <Icon d="check" size={14} sw={2.2} />}
                      {s.key === "all" ? "All" : s.key === "validated" ? "Validated" : "Needs Review"} ({s.key === "all" ? cmp.length : s.key === "validated" ? validated : needsReview})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="table-wrap">
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
                    <th className="action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr className="empty">
                      <td colSpan={8}>
                        {loadState === "loading" ? "Loading shipments…" : loadState === "error" ? "Could not load shipments from Firestore." : "No shipments match your filter criteria."}
                      </td>
                    </tr>
                  )}
                  {rows.map((s) => {
                    const cat = CATS[s.category];
                    return (
                      <tr key={s.id} onClick={() => setOpenId(s.id)}>
                        <td className="id">{s.id}</td>
                        <td className="subject">
                          <span title={s.subject}>{s.subject}</span>
                        </td>
                        <td className="sender">{s.sender}</td>
                        <td>
                          <span className="tag" style={{ color: cat.color, background: cat.bg }}>
                            {cat.label}
                          </span>
                        </td>
                        <td className="muted">{s.date}</td>
                        <td>
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
                        <td>
                          {s.category === "document-comparison" && s.status === "discrepancy" && (
                            <span className="status rose">
                              <span className="dot" />
                              Needs Review
                            </span>
                          )}
                          {s.category === "document-comparison" && s.status === "clean" && (
                            <span className="status green">
                              <Icon d="check" size={14} sw={2.2} />
                              Validated
                            </span>
                          )}
                          {s.status === "pending" && <span className="muted">Received</span>}
                        </td>
                        <td className="action">
                          <button
                            className="row-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenId(s.id);
                            }}
                          >
                            {s.category === "document-comparison" ? "Inspect" : "Read"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {selected && (
        <ReviewModal
          key={selected.id}
          shipment={selected}
          onClose={() => setOpenId(null)}
          onSave={(fields) => save(selected, fields)}
          onDone={() => {
            showToast(`Marked ${selected.id} as completed.`);
            setOpenId(null);
          }}
          onToast={showToast}
        />
      )}
    </div>
  );
}
