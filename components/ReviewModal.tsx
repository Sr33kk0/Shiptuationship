"use client";

import { useEffect, useRef, useState } from "react";
import { CATS, FIELDS, fmtWhen, mismatches, type FieldKey, type Fields, type Shipment, type Side } from "@/lib/shipments";
import { Icon } from "./Icon";

type Pane = "preview" | "email";
type DocView = "split" | "si" | "bl";

function Seg<T extends string>({ value, options, onChange, sm }: { value: T; options: [T, string][]; onChange: (v: T) => void; sm?: boolean }) {
  return (
    <div className={`seg${sm ? " sm" : ""}`}>
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// One document. A field that differs from the other document is shown in red, but only on the document being edited (see the calls below).
function Paper({ kind, refNo, values, bad }: { kind: "si" | "bl"; refNo?: string; values: Fields; bad: FieldKey[] }) {
  const cell = (k: FieldKey, label: string, extra = "", fmt = (v: string) => v) => (
    <div>
      <span className="k">{label}</span>
      <span className={`v${extra}${bad.includes(k) ? " bad" : ""}`}>{fmt(values[k])}</span>
    </div>
  );
  return (
    <div className={`paper ${kind}`}>
      <div className="paper-head">
        <div>
          <h4>{kind === "si" ? "Shipping Instruction" : "Draft Bill of Lading"}</h4>
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
          {cell("containerCount", "6. Container Count", " num", (v) => `${v} x 40HC`)}
          {cell("grossWeightKg", "7. Gross Weight", " num", (v) => `${v} kg`)}
        </div>
      </div>
    </div>
  );
}

function Attachments({ names, heading }: { names: string[]; heading: string }) {
  if (!names.length) return null;
  return (
    <div className="attach">
      <span className="k">{heading}</span>
      <div className="chips">
        {names.map((n, i) => (
          <div key={n} className="chip" style={{ "--i": i } as React.CSSProperties}>
            <Icon d="doc" />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  shipment: Shipment;
  saving: boolean;
  onClose: () => void;
  onSave: (side: Side, fields: Fields) => void;
  onMarkRead: () => void;
  onToast: (msg: string) => void;
}

const actionTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "medium" }) + " MYT";

export default function ReviewModal({ shipment: s, saving, onClose, onSave, onMarkRead, onToast }: Props) {
  const isCmp = s.category === "document-comparison" && !!s.referenceFields && !!s.extractedFields;
  const [side, setSide] = useState<Side>("bl"); // which document the form edits
  const [form, setForm] = useState<Fields>(s.extractedFields ?? ({} as Fields));
  const [pane, setPane] = useState<Pane>("preview");
  const [docView, setDocView] = useState<DocView>("split");
  const [formOpen, setFormOpen] = useState(true);
  const cat = CATS[s.category];

  // Every way out (X, Escape, Close) plays the exit first, then hands over to the parent, which unmounts the modal.
  const [closing, setClosing] = useState(false);
  const leaving = useRef(false);
  const exitTimer = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(exitTimer.current), []);
  const leave = (then: () => void) => {
    if (leaving.current) return; // already on its way out (a second click or key press)
    leaving.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return then();
    setClosing(true);
    exitTimer.current = window.setTimeout(then, 200); // keep in step with the 0.2s exit in globals.css
  };
  const close = () => leave(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave(onClose);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isCmp) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]")) return; // not while typing in a field
      if (e.key === "ArrowRight") setPane("email");
      if (e.key === "ArrowLeft") setPane("preview");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCmp]);

  const saved = (x: Side) => (x === "si" ? s.referenceFields : s.extractedFields);
  const dirty = FIELDS.some((f) => form[f.key] !== saved(side)?.[f.key]);
  const switchSide = (next: Side) => {
    if (next === side) return;
    if (dirty) onToast(`Discarded unsaved ${side.toUpperCase()} edits`);
    setSide(next);
    setForm(saved(next) ?? ({} as Fields));
  };

  // The edited side shows the live form; the other side shows what is saved.
  const si = side === "si" ? form : s.referenceFields;
  const bl = side === "bl" ? form : s.extractedFields;
  const bad = si && bl ? mismatches(si, bl) : [];
  // What to mark. Normally the live comparison of the two documents. If the automatic check flagged the email but the two documents match
  // exactly (it can compare more loosely than this screen does), fall back to the fields it named, so the banner never has nothing to point at.
  const named = s.status === "discrepancy" ? s.discrepancies.map((d) => d.field) : [];
  const flagged: FieldKey[] = bad.length ? bad : !dirty ? named : [];
  // The banner lists exactly what is marked below: the live differences, or the automatic check's own wording when it had to be used instead.
  const summary = bad.length && si && bl
    ? bad.map((k) => `${FIELDS.find((f) => f.key === k)!.label} (${si[k]} on SI vs ${bl[k]} on Draft BL)`)
    : s.discrepancies.map((d) => `${d.label} (${d.si} on SI vs ${d.bl} on Draft BL)`);

  return (
    <div className={`overlay${closing ? " closing" : ""}`}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${isCmp ? "Manifest Inspection" : "Email Transmission"} ${s.id}`}>
        <div className="modal-head">
          <div className="modal-title">
            <div className="modal-ic">
              <Icon d="doc" size={20} />
            </div>
            <div>
              <div className="modal-line">
                <h3>{isCmp ? `Manifest Inspection — ${s.id}` : `Email Transmission — ${s.id}`}</h3>
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
            {isCmp && <button className="btn ghost" disabled={saving || s.isRead} onClick={onMarkRead}>{s.isRead ? "Read" : saving ? "Saving…" : "Mark as Read"}</button>}
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

        {isCmp && si && bl ? (
          <div className="cmp">
            {s.status === "discrepancy" && summary.length > 0 && (
              <div className="banner">
                <div>
                  <Icon d="alert" sw={2} />
                  <span>
                    <strong>Discrepancy Detected:</strong> {summary.join(" • ")}
                  </span>
                </div>
                <em>Action Required</em>
              </div>
            )}

            <div className="cmp-body">
              {formOpen && (
                <div className="form-pane">
                  <div className="form-head">
                    <b>Manifest Fields</b>
                    <span>Edit to override</span>
                  </div>
                  <div className="form-side">
                    <span>Editing</span>
                    <Seg
                      sm
                      value={side}
                      onChange={switchSide}
                      options={[
                        ["bl", "Carrier Draft BL"],
                        ["si", "Customer SI"],
                      ]}
                    />
                  </div>
                  <div className="form-fields">
                    {FIELDS.map((f, i) => {
                      const off = flagged.includes(f.key);
                      return (
                        <div key={f.key} className="field">
                          <div className="field-top">
                            <label htmlFor={`f-${f.key}`}>
                              {i + 1}. {f.label}
                            </label>
                            {off && (
                              <span>
                                {side === "si" ? "BL" : "SI"}: {(side === "si" ? bl : si)[f.key]}
                                {"unit" in f ? f.unit : ""}
                              </span>
                            )}
                          </div>
                          <input id={`f-${f.key}`} type="text" disabled={saving} className={off ? "bad" : ""} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="form-foot">
                    <button
                      className="btn ghost"
                      disabled={saving}
                      onClick={() => {
                        setForm(saved(side)!);
                        onToast(`Reset ${side.toUpperCase()} fields to their last saved values`);
                      }}
                    >
                      <Icon d="refresh" size={14} sw={2} />
                      Reset
                    </button>
                    <button className="btn dark grow" disabled={saving} onClick={() => onSave(side, form)}>
                      <Icon d="check" size={14} sw={2.2} />
                      {saving ? "Saving…" : `Save ${side.toUpperCase()} Changes`}
                    </button>
                  </div>
                </div>
              )}

              <div className="doc-pane">
                {pane === "preview" ? (
                  <>
                    <div className="doc-bar">
                      <button className="toggle" onClick={() => setFormOpen(!formOpen)}>
                        {formOpen ? "Maximize Document Space" : "Show Edit Form"}
                      </button>
                      <Seg
                        sm
                        value={docView}
                        onChange={setDocView}
                        options={[
                          ["split", "Side-by-Side"],
                          ["si", "Customer SI"],
                          ["bl", "Carrier Draft BL"],
                        ]}
                      />
                    </div>
                    <div className="docs">
                      {/* keyed by the view, so each switch re-creates the papers and they fade in again (typing in the form does not) */}
                      {/* the red text follows the document being edited (the "Editing" switch): the SI's wrong fields when editing the SI, the BL's when editing the BL, never both */}
                      {docView !== "bl" && <Paper key={`si-${docView}`} kind="si" refNo={s.siRef} values={si} bad={side === "si" ? flagged : []} />}
                      {docView !== "si" && <Paper key={`bl-${docView}`} kind="bl" refNo={s.blRef} values={bl} bad={side === "bl" ? flagged : []} />}
                    </div>
                    <button className="pane-jump next" onClick={() => setPane("email")} title="Read the email (right arrow key)">
                      Read Email
                      <Icon d="chevR" size={16} sw={2.4} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="email">
                      <div className="email-card">
                        <div className="email-head">
                          <h4>{s.subject}</h4>
                          <div className="email-meta">
                            <span>From: {s.sender}</span>
                            <span>Date: {fmtWhen(s)}</span>
                          </div>
                        </div>
                        <div className="email-body">{s.emailBody}</div>
                        <Attachments names={s.attachmentNames} heading={`Attachments (${s.attachmentNames.length})`} />
                      </div>
                    </div>
                    <button className="pane-jump prev" onClick={() => setPane("preview")} title="Back to the comparison (left arrow key)">
                      <Icon d="chevL" size={16} sw={2.4} />
                      Comparison
                    </button>
                  </>
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
              <Attachments names={s.attachmentNames} heading="Attached Files" />
            </div>
            <div className="plain-foot">
              <button className="btn ghost lg" onClick={close}>
                Close
              </button>
              <button className="btn dark lg" disabled={saving || s.isRead} onClick={onMarkRead}>
                {s.isRead ? "Read" : saving ? "Saving…" : "Mark as Read"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
