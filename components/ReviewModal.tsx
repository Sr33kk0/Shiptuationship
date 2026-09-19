"use client";

import { useEffect, useState } from "react";
import { CATS, FIELDS, mismatches, type FieldKey, type Fields, type Shipment } from "@/lib/shipments";
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

function Paper({ kind, refNo, values, bad }: { kind: "si" | "bl"; refNo?: string; values: Fields; bad: FieldKey[] }) {
  const cls = (k: FieldKey) => (bad.includes(k) ? " bad" : "");
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
        {(
          [
            ["shipper", "1. Shipper"],
            ["consignee", "2. Consignee"],
            ["notifyParty", "3. Notify Party"],
          ] as const
        ).map(([k, label]) => (
          <div key={k}>
            <span className="k">{label}</span>
            <span className="v">{values[k]}</span>
          </div>
        ))}
        <div className="paper-row">
          <div>
            <span className="k">4. POL</span>
            <span className="v port">{values.pol}</span>
          </div>
          <div>
            <span className="k">5. POD</span>
            <span className={`v port${cls("pod")}`}>{values.pod}</span>
          </div>
        </div>
        <div className="paper-row">
          <div>
            <span className="k">6. Container Count</span>
            <span className={`v num${cls("containerCount")}`}>{values.containerCount} x 40HC</span>
          </div>
          <div>
            <span className="k">7. Gross Weight</span>
            <span className={`v num${cls("grossWeightKg")}`}>{values.grossWeightKg} kg</span>
          </div>
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
        {names.map((n) => (
          <div key={n} className="chip">
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
  onClose: () => void;
  onSave: (fields: Fields) => void;
  onDone: () => void;
  onToast: (msg: string) => void;
}

export default function ReviewModal({ shipment: s, onClose, onSave, onDone, onToast }: Props) {
  const isCmp = s.category === "document-comparison" && !!s.referenceFields && !!s.extractedFields;
  const [form, setForm] = useState<Fields>(s.extractedFields ?? ({} as Fields));
  const [pane, setPane] = useState<Pane>("preview");
  const [docView, setDocView] = useState<DocView>("split");
  const [formOpen, setFormOpen] = useState(true);
  const cat = CATS[s.category];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ref = s.referenceFields;
  const bad = ref ? mismatches(form, ref) : [];

  return (
    <div className="overlay">
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
                {s.sender} • {s.date}
              </small>
            </div>
          </div>
          <div className="modal-actions">
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
            <button className="close" onClick={onClose} aria-label="Close">
              <Icon d="x" sw={2} />
            </button>
          </div>
        </div>

        {isCmp && ref ? (
          <div className="cmp">
            {s.status === "discrepancy" && s.discrepancies.length > 0 && (
              <div className="banner">
                <div>
                  <Icon d="alert" sw={2} />
                  <span>
                    <strong>Discrepancy Detected:</strong> {s.discrepancies.map((d) => `${d.label} (${d.si} on SI vs ${d.bl} on Draft BL)`).join(" • ")}
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
                  <div className="form-fields">
                    {FIELDS.map((f, i) => {
                      const off = bad.includes(f.key);
                      return (
                        <div key={f.key} className="field">
                          <div className="field-top">
                            <label htmlFor={`f-${f.key}`}>
                              {i + 1}. {f.label}
                            </label>
                            {off && (
                              <span>
                                SI: {ref[f.key]}
                                {"unit" in f ? f.unit : ""}
                              </span>
                            )}
                          </div>
                          <input id={`f-${f.key}`} type="text" className={off ? "bad" : ""} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="form-foot">
                    <button
                      className="btn ghost"
                      onClick={() => {
                        setForm(s.extractedFields!);
                        onToast("Reset fields back to carrier's draft values");
                      }}
                    >
                      <Icon d="refresh" size={14} sw={2} />
                      Reset
                    </button>
                    <button className="btn dark grow" onClick={() => onSave(form)}>
                      <Icon d="check" size={14} sw={2.2} />
                      Save Changes
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
                      {docView !== "bl" && <Paper kind="si" refNo={s.siRef} values={ref} bad={[]} />}
                      {docView !== "si" && <Paper kind="bl" refNo={s.blRef} values={form} bad={bad} />}
                    </div>
                  </>
                ) : (
                  <div className="email">
                    <div className="email-card">
                      <div className="email-head">
                        <h4>{s.subject}</h4>
                        <div className="email-meta">
                          <span>From: {s.sender}</span>
                          <span>Date: {s.date}</span>
                        </div>
                      </div>
                      <div className="email-body">{s.emailBody}</div>
                      <Attachments names={s.attachmentNames} heading={`Attachments (${s.attachmentNames.length})`} />
                    </div>
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
                <span className="muted">{s.date}</span>
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
              <button className="btn ghost lg" onClick={onClose}>
                Close
              </button>
              <button className="btn dark lg" onClick={onDone}>
                Mark as Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
