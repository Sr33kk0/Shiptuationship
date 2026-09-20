"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

interface Props<K extends string> {
  open: boolean;
  options: [K, string][];
  value: K;
  dir: "asc" | "desc";
  onChange: (key: K, dir: "asc" | "desc") => void;
  onClose: () => void;
}

// A bottom sheet for choosing what to sort by. It replaces the browser's own <select>, whose popup is drawn by the phone
// (so it can run off the screen and cannot be styled). This one always sits inside the viewport and matches the app.
export default function SortSheet<K extends string>({ open, options, value, dir, onChange, onClose }: Props<K>) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number>(undefined);
  const selected = useRef<HTMLButtonElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const leave = () => {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 200); // keep in step with the exit in globals.css
  };

  useEffect(() => {
    if (!open) return;
    selected.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={`sheet-overlay${closing ? " closing" : ""}`} onClick={leave}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Sort emails" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h3>Sort by</h3>
          <button className="sheet-x" onClick={leave} aria-label="Close">
            <Icon d="x" size={18} sw={2} />
          </button>
        </div>

        <div className="seg sheet-dir" role="group" aria-label="Order">
          <button aria-pressed={dir === "asc"} onClick={() => onChange(value, "asc")}>
            <Icon d="sortAsc" size={15} sw={2.2} /> Ascending
          </button>
          <button aria-pressed={dir === "desc"} onClick={() => onChange(value, "desc")}>
            <Icon d="sortDesc" size={15} sw={2.2} /> Descending
          </button>
        </div>

        <div className="sheet-opts" role="radiogroup" aria-label="Sort by">
          {options.map(([key, label]) => (
            <button
              key={key}
              ref={key === value ? selected : undefined}
              className="sheet-opt"
              role="radio"
              aria-checked={key === value}
              onClick={() => {
                onChange(key, dir);
                leave();
              }}
            >
              {label}
              {key === value && <Icon d="check" size={18} sw={2.4} />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
