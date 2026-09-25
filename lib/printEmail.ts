import { PATH } from "@/components/Icon";
import { CATS, FIELDS, fmtWhen, type Shipment } from "./shipments";

// Everything below goes into a page of its own, so every value is escaped: the email body and subject come from outside.
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "medium" }) + " MYT";
const STATUS = { discrepancy: "Needs Review", clean: "Validated", pending: "Received" };

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#e5e7eb;color:#111827;font:12px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
.bar{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;background:#111827;color:#fff;font-size:13px}
.bar button{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:0;border-radius:6px;background:#fff;color:#111827;font:600 13px system-ui,sans-serif;cursor:pointer}
.sheet{width:min(210mm,100%);min-height:297mm;margin:20px auto;padding:15mm;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.2)}
h1{margin:0;font-size:18px;line-height:24px}
.sub{margin:2px 0 0;color:#6b7280}
h2{margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid #9ca3af;font-size:12px;letter-spacing:.05em;text-transform:uppercase;break-after:avoid}
table{width:100%;border-collapse:collapse}
th,td{padding:5px 8px;border:1px solid #d1d5db;text-align:left;vertical-align:top;overflow-wrap:anywhere}
thead th{background:#f3f4f6}
.meta th{width:34mm;background:#f3f4f6}
.cmp :is(th,td):last-child{width:1%;white-space:nowrap}
tr{break-inside:avoid}
.bad{background:#fff1f2;color:#be123c;font-weight:700}
ul{margin:0;padding-left:18px}
.body{padding:10px;border:1px solid #d1d5db;white-space:pre-wrap;overflow-wrap:anywhere}
.foot{margin-top:24px;color:#6b7280;font-size:10px}
@page{size:A4;margin:15mm}
@media print{body{background:#fff}.bar{display:none}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

const row = (k: string, v: string) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "");

function page(s: Shipment) {
  const cmp = s.category === "document-comparison" && s.referenceFields && s.extractedFields ? { si: s.referenceFields, bl: s.extractedFields } : null;
  const title = s.id;
  const from = s.senderName ? `${s.senderName} <${s.sender}>` : s.sender;

  const meta = [
    row("Email #", s.id),
    row("Subject", s.subject),
    row("From", from),
    row("Received", fmtWhen(s)),
    row("Category", CATS[s.category].label),
    row("Status", STATUS[s.status]),
    row("Read", s.isRead ? "Read" : "Unread"),
    row("SI reference", s.siRef ?? ""),
    row("Draft BL reference", s.blRef ?? ""),
    row("Reviewed by", s.reviewedAt ? `${s.reviewedBy || "Unknown reviewer"} · ${stamp(s.reviewedAt)}` : ""),
    row("Marked as read by", s.markedReadAt ? `${s.markedReadBy || "Unknown reviewer"} · ${stamp(s.markedReadAt)}` : ""),
  ].join("");

  const reasons = s.reviewReasons.length ? `<h2>Human review required</h2><ul>${s.reviewReasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "";

  const compare = cmp
    ? `<h2>SI vs Draft BL</h2><table class="cmp"><thead><tr><th>Field</th><th>Customer SI</th><th>Carrier Draft BL</th><th>Result</th></tr></thead><tbody>${FIELDS.map((f) => {
        const unit = "unit" in f ? f.unit : "";
        const bad = cmp.si[f.key] !== cmp.bl[f.key] ? ' class="bad"' : "";
        return `<tr><td>${f.label}</td><td${bad}>${esc(cmp.si[f.key])}${unit}</td><td${bad}>${esc(cmp.bl[f.key])}${unit}</td><td${bad}>${bad ? "Mismatch" : "Match"}</td></tr>`;
      }).join("")}</tbody></table>`
    : "";

  const found = s.discrepancies.length
    ? `<h2>Discrepancies found by the automatic check</h2><ul>${s.discrepancies.map((d) => `<li>${esc(d.label)}: ${esc(d.si)} on the SI vs ${esc(d.bl)} on the Draft BL${d.note ? ` — ${esc(d.note)}` : ""}</li>`).join("")}</ul>`
    : "";

  const files = s.attachmentNames.length ? `<h2>Attachments (${s.attachmentNames.length})</h2><ul>${s.attachmentNames.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";

  const trail = s.auditTrail.length
    ? `<h2>Audit trail</h2><table><thead><tr><th>Time</th><th>Action</th></tr></thead><tbody>${s.auditTrail.map((a) => `<tr><td>${esc(a.time)}</td><td>${esc(a.action)}</td></tr>`).join("")}</tbody></table>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<div class="bar"><span>Print preview (A4). Choose “Save as PDF” as the destination to keep a copy.</span><button onclick="window.print()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATH.print}"/></svg>Print / Save as PDF</button></div>
<div class="sheet">
<h1>${esc(title)}</h1><p class="sub">${esc(CATS[s.category].label)}</p>
<h2>Details</h2><table class="meta">${meta}</table>
${reasons}${compare}${found}
<h2>Email body</h2><div class="body">${esc(s.emailBody)}</div>
${files}${trail}
<p class="foot">Printed ${esc(stamp(new Date().toISOString()))}</p>
</div></body></html>`;
}

/** Opens the print preview for one email in a new tab. Returns false when the browser blocked the tab. */
export function printEmail(s: Shipment): boolean {
  const url = URL.createObjectURL(new Blob([page(s)], { type: "text/html" }));
  const w = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // long enough for the tab to load it
  return !!w;
}
