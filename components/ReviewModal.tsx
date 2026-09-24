"use client";

import { useEffect, useRef, useState } from "react";
import { CATS, FIELDS, fmtWhen, mismatches, type Edits, type FieldKey, type Fields, type Shipment, type Side } from "@/lib/shipments";
import { printEmail } from "@/lib/printEmail";
import { Icon } from "./Icon";

type Pane = "preview" | "email";

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// One document. A field that differs from the other document is shown in red. With `onChange` its fields are edited in place;
// without it (auditors) it is plain text.
function Paper({ kind, refNo, values, bad, onChange, disabled }: { kind: Side; refNo?: string; values: Fields; bad: FieldKey[]; onChange?: (f: Fields) => void; disabled?: boolean }) {
  const name = kind === "si" ? "Shipping Instruction" : "Draft Bill of Lading";
  const cell = (k: FieldKey, label: string, extra = "", unit = "") => {
    const cls = `v${extra}${bad.includes(k) ? " bad" : ""}`;
    return onChange ? (
      <label>
        <span className="k">{label}</span>
        <span className="v-edit">
          <input type="text" className={cls} disabled={disabled} value={values[k] ?? ""} onChange={(e) => onChange({ ...values, [k]: e.target.value })} />
          {unit && <span className="unit">{unit}</span>}
        </span>
      </label>
    ) : (
      <div>
        <span className="k">{label}</span>
        <span className={cls}>{values[k]}{unit && ` ${unit}`}</span>
      </div>
    );
  };
  return (
    <div className={`paper ${kind}`} role="group" aria-label={name}>
      <div className="paper-head">
        <div>
          <h4>{name}</h4>
          <small>{kind === "si" ? "Customer Reference" : "Carrier Verification Draft"}</small>
        </div>
        {refNo && <span className="ref">{refNo}</span>}
      </div>
      <div className="paper-body">
        {cell("shipper", "1. Shipper")}
        {cell("consignee", "2. Consignee")}
        {cell("notifyParty", "3. Notify Party")}
        <div className="paper-row">
          {cell("pol", "4. POL", " port")}
          {cell("pod", "5. POD", " port")}
        </div>
        <div className="paper-row">
          {cell("containerCount", "6. Container Count", " num", "x 40HC")}
          {cell("grossWeightKg", "7. Gross Weight", " num", "kg")}
        </div>
      </div>
    </div>
  );
}

// A file with a stored Google Drive link (the SI and BL) opens it in a new tab; any other attachment is only a name.
function Attachments({ names, links, heading }: { names: string[]; links: Record<string, string>; heading: string }) {
  if (!names.length) return null;
  return (
    <div className="attach">
      <span className="k">{heading}</span>
      <div className="chips">
        {names.map((n, i) =>
          links[n] ? (
            <a key={n} className="chip" href={links[n]} target="_blank" rel="noopener noreferrer" title={`Open ${n} in Google Drive`} style={{ "--i": i } as React.CSSProperties}>
              <Icon d="doc" />
              <span>{n}</span>
              <Icon d="external" size={12} sw={2} />
            </a>
          ) : (
            <div key={n} className="chip" style={{ "--i": i } as React.CSSProperties}>
              <Icon d="doc" />
              <span>{n}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

type Reply = { body: string };

// The AI Reply section below an email, with an editable reply and an inline copy control.
function AIReply({ reply, generating, onChange, onCopy }: { reply: Reply | null; generating: boolean; onChange: (r: Reply) => void; onCopy: (text: string, what: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const show = generating || !!reply;
  useEffect(() => {
    if (show) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); // it opens below the fold on a long email
  }, [show]);
  if (!show) return null;
  return (
    <section className="reply" ref={ref} aria-label="AI Reply" aria-busy={generating}>
      <h4>AI Reply</h4>
      {generating || !reply ? (
        <div className="reply-wait" role="status">
          <span className="cog">
            <Icon d="cog" size={28} sw={1.6} />
          </span>
          Generating reply…
        </div>
      ) : (
        <div className="reply-field">
          <textarea aria-label="AI Reply" rows={14} value={reply.body} onChange={(e) => onChange({ ...reply, body: e.target.value })} />
          <button type="button" className="reply-copy" aria-label="Copy AI Reply" title="Copy AI Reply" onClick={() => onCopy(reply.body, "AI Reply")}>
            <Icon d="copy" size={16} />
          </button>
        </div>
      )}
    </section>
  );
}

interface Props {
  shipment: Shipment;
  saving: boolean;
  onClose: () => void;
  onSave: (edits: Edits) => void; // the SI and BL, saved together
  onMarkRead: () => void;
  onClear: () => void; // validates a flagged email that has no SI / BL comparison
  onToast: (msg: string) => void;
  readOnly?: boolean; // auditors: no edit form, Mark as Read, Clear & Validate or AI Reply (proxy.ts refuses them anyway)
  onPrev?: () => void; // undefined = no earlier email in the list
  onNext?: () => void;
}

const actionTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "medium" }) + " MYT";

export default function ReviewModal({ shipment: s, saving, onClose, onSave, onMarkRead, onClear, onToast, readOnly, onPrev, onNext }: Props) {
  const isCmp = s.category === "document-comparison" && !!s.referenceFields && !!s.extractedFields;
  const savedDrafts = () => ({ si: s.referenceFields ?? ({} as Fields), bl: s.extractedFields ?? ({} as Fields) });
  const [drafts, setDrafts] = useState<Edits>(savedDrafts); // both documents are edited in place and saved together
  const [pane, setPane] = useState<Pane>("preview");
  const [reply, setReply] = useState<Reply | null>(null);
  const [generating, setGenerating] = useState(false);
  const replyRequest = useRef<AbortController>(null);
  const [reasonsOpen, setReasonsOpen] = useState(true); // phones only: the review reasons can be folded away (the button is hidden, and the fold ignored, on desktop)
  // Stepping to another email keeps the modal (and the chosen pane) open; only the edits belong to one email, so they restart here.
  const [shownId, setShownId] = useState(s.id);
  if (shownId !== s.id) {
    replyRequest.current?.abort();
    setShownId(s.id);
    setDrafts(savedDrafts());
    setReply(null);
    setGenerating(false);
  }
  const cat = CATS[s.category];

  // Every way out (X, Escape, Close) plays the exit first, then hands over to the parent, which unmounts the modal.
  const [closing, setClosing] = useState(false);
  const leaving = useRef(false);
  const exitTimer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(exitTimer.current), []);
  useEffect(() => () => replyRequest.current?.abort(), []);
  const generate = async () => {
    const request = new AbortController();
    replyRequest.current = request;
    setGenerating(true);
    try {
      const res = await fetch("/api/auto-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: { id: s.id, subject: s.subject, sender: s.sender, senderName: s.senderName, body: s.emailBody, category: cat.label, attachments: s.attachmentNames },
          comparison: isCmp ? { si: s.referenceFields, bl: s.extractedFields, discrepancies: s.discrepancies } : undefined,
        }),
        signal: request.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not generate a reply");
      if (typeof data.body !== "string" || !data.body.trim()) throw new Error("n8n returned an empty reply");
      setReply({ body: data.body.trim() });
    } catch (error) {
      if ((error as Error).name !== "AbortError") onToast(`Reply generation failed: ${(error as Error).message}`);
    } finally {
      if (replyRequest.current === request) {
        replyRequest.current = null;
        setGenerating(false);
      }
    }
  };
  const leave = (then: () => void) => {
    if (leaving.current) return; // already on its way out (a second click or key press)
    leaving.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return then();
    setClosing(true);
    exitTimer.current = window.setTimeout(then, 200); // keep in step with the 0.2s exit in globals.css
  };

  const same = (a: Edits, b: Edits) => FIELDS.every((f) => a.si[f.key] === b.si[f.key] && a.bl[f.key] === b.bl[f.key]);
  const saved = savedDrafts();
  const original = { si: s.originalReferenceFields ?? saved.si, bl: s.originalExtractedFields ?? saved.bl };
  const dirty = (["si", "bl"] as const).filter((x) => FIELDS.some((f) => drafts[x][f.key] !== saved[x][f.key]));
  // Leaving this email (close, or step to another) with unsaved edits asks first; `confirm` holds where to go if the answer is Discard.
  const [confirm, setConfirm] = useState<(() => void) | null>(null);
  const guard = (go: () => void) => (dirty.length ? setConfirm(() => go) : go());
  const close = () => guard(() => leave(onClose));
  const step = (go?: () => void) => go && guard(go);

  // Re-bound on every render so the keys always see the current edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm) return e.key === "Escape" && setConfirm(null); // Escape answers the question with Keep Editing
      if (e.key === "Escape") return close();
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return; // not while typing in a field
      if (e.key === "ArrowRight") step(onNext);
      if (e.key === "ArrowLeft") step(onPrev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const copy = (text: string, what: string) =>
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
      () => onToast(`Copied ${what}`),
      () => onToast("Could not copy — select the text and copy it manually"),
    );

  const { si, bl } = drafts;
  const bad = isCmp ? mismatches(si, bl) : [];
  // What to mark. Normally the live comparison of the two documents. If the automatic check flagged the email but the two documents match
  // exactly (it can compare more loosely than this screen does), fall back to the fields it named, so the banner never has nothing to point at.
  const named = s.status === "discrepancy" ? s.discrepancies.map((d) => d.field) : [];
  const flagged: FieldKey[] = bad.length ? bad : !dirty.length ? named : [];
  const edit = (x: Side) => (readOnly ? undefined : (f: Fields) => setDrafts({ ...drafts, [x]: f }));

  return (
    <div className={`overlay${closing ? " closing" : ""}`}>
      <button className="nav-email prev" disabled={!onPrev} onClick={() => step(onPrev)} aria-label="Previous email" title="Previous email (left arrow key)">
        <Icon d="chevL" size={20} sw={2.4} />
      </button>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${isCmp ? "Manifest Inspection" : "Email Transmission"} ${s.id}`}>
        <div className="modal-head">
          <div className="modal-title">
            <div className="modal-ic">
              <Icon d="doc" size={20} />
            </div>
            <div>
              <div className="modal-line">
                <span className="tag" style={{ color: cat.color, background: cat.bg }}>
                  {isCmp ? "SI vs Draft BL" : cat.label}
                </span>
              </div>
              <small>
                {s.sender} • {fmtWhen(s)}
              </small>
              {s.reviewedAt && <div><small>Reviewed by {s.reviewedBy || "Unknown reviewer"} · {actionTime(s.reviewedAt)}</small></div>}
              {s.markedReadAt && <div><small>Marked as read by {s.markedReadBy || "Unknown reviewer"} · {actionTime(s.markedReadAt)}</small></div>}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => printEmail(s) || onToast("Allow pop-ups to open the print preview")} title="Open a print preview of this email (A4)">
              <Icon d="print" size={14} sw={2} />
              Print
            </button>
            {isCmp && !readOnly && <button className="btn dark" disabled={saving || s.isRead} onClick={onMarkRead}>{s.isRead ? "Read" : saving ? "Saving…" : "Mark as Read"}</button>}
            {isCmp && (
              <Seg
                value={pane}
                onChange={setPane}
                options={[
                  ["preview", "Side-by-Side Review"],
                  ["email", "Read Email"],
                ]}
              />
            )}
            <button className="close" onClick={close} aria-label="Close">
              <Icon d="x" sw={2} />
            </button>
          </div>
        </div>

        {s.status === "discrepancy" && (
          <section className={`banner review-reasons${reasonsOpen ? "" : " collapsed"}`} aria-label="Human review reasons">
            <div>
              <Icon d="alert" sw={2} />
              <div>
                <strong>Human review required</strong>
                <ul id="review-reasons-list">{s.reviewReasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
              </div>
            </div>
            <button className="rr-toggle" onClick={() => setReasonsOpen(!reasonsOpen)} aria-expanded={reasonsOpen} aria-controls="review-reasons-list" aria-label={reasonsOpen ? "Hide review reasons" : "Show review reasons"}>
              <Icon d="chevD" size={18} sw={2.2} />
            </button>
          </section>
        )}

        {isCmp ? (
          <div className="cmp">
            <div className="cmp-body">
              <div className="doc-pane">
                {pane === "preview" ? (
                  <>
                    <div className="docs">
                      {/* keyed by the email, so stepping re-creates the papers and they fade in again (typing in them does not) */}
                      {/* both documents are edited in place; a field that differs is red on both */}
                      <Paper key={`si-${s.id}`} kind="si" refNo={s.siRef} values={si} bad={flagged} onChange={edit("si")} disabled={saving} />
                      <Paper key={`bl-${s.id}`} kind="bl" refNo={s.blRef} values={bl} bad={flagged} onChange={edit("bl")} disabled={saving} />
                    </div>
                    {!readOnly && (
                      <div className="doc-foot">
                        {/* back to what n8n extracted, before any human review; it is kept only once saved */}
                        <button
                          className="btn ghost"
                          disabled={saving || same(drafts, original)}
                          onClick={() => {
                            setDrafts(original);
                            onToast("Reset to the original documents. Save Changes to keep it.");
                          }}
                        >
                          <Icon d="refresh" size={14} sw={2} />
                          Reset to Original
                        </button>
                        <button className="btn dark" disabled={saving || !dirty.length} onClick={() => onSave(drafts)}>
                          <Icon d="check" size={14} sw={2.2} />
                          {saving ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="email">
                    <div className="email-card" key={s.id}>
                      <div className="email-head">
                        <h4>{s.subject}</h4>
                        <div className="email-meta">
                          <span>From: {s.sender}</span>
                          <span>Date: {fmtWhen(s)}</span>
                        </div>
                      </div>
                      <div className="email-body">{s.emailBody}</div>
                      <Attachments names={s.attachmentNames} links={s.attachmentLinks} heading={`Attachments (${s.attachmentNames.length})`} />
                    </div>
                    <div className="reply-actions">
                      {!readOnly && (
                        <button className="btn dark" disabled={generating} onClick={generate}>
                          {reply ? "Regenerate AI Reply" : "Generate AI Reply"}
                        </button>
                      )}
                      <button className="btn ghost" onClick={() => setPane("preview")}>
                        Side-by-Side Review
                      </button>
                    </div>
                    <AIReply reply={reply} generating={generating} onChange={setReply} onCopy={copy} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="email plain">
            <div className="email-card plain-card">
              <div className="plain-top">
                <span className="tag" style={{ color: cat.color, background: cat.bg }}>
                  {cat.label}
                </span>
                <span className="muted">{fmtWhen(s)}</span>
              </div>
              <div>
                <h2>{s.subject}</h2>
                <div className="plain-from">
                  From: {s.senderName} &lt;{s.sender}&gt;
                </div>
              </div>
              <div className="email-body boxed">{s.emailBody}</div>
              <Attachments names={s.attachmentNames} links={s.attachmentLinks} heading="Attached Files" />
              <AIReply reply={reply} generating={generating} onChange={setReply} onCopy={copy} />
            </div>
            <div className="plain-foot">
              <button className="btn ghost lg" onClick={close}>
                Close
              </button>
              {!readOnly && (
                <>
                  <button className="btn dark lg" disabled={generating} onClick={generate}>
                    {reply ? "Regenerate AI Reply" : "Generate AI Reply"}
                  </button>
                  <button className="btn dark lg" disabled={saving || s.isRead} onClick={onMarkRead}>
                    {s.isRead ? "Read" : saving ? "Saving…" : "Mark as Read"}
                  </button>
                  {s.category !== "document-comparison" && s.status === "discrepancy" && (
                    <button className="btn dark lg" disabled={saving} onClick={onClear}>
                      <Icon d="check" size={16} sw={2.2} />
                      Clear &amp; Validate
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <button className="nav-email next" disabled={!onNext} onClick={() => step(onNext)} aria-label="Next email" title="Next email (right arrow key)">
        <Icon d="chevR" size={20} sw={2.4} />
      </button>
      {confirm && (
        <div className="confirm-back">
          <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
            <h3 id="confirm-title">Discard unsaved changes?</h3>
            <p id="confirm-text">Your changes to the {dirty.map((x) => x.toUpperCase()).join(" and ")} have not been saved. They will be lost if you leave this email.</p>
            <div className="confirm-actions">
              <button className="btn ghost" autoFocus onClick={() => setConfirm(null)}>
                Keep Editing
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  setConfirm(null);
                  confirm();
                }}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
