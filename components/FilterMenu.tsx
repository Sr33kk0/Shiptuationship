"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface FilterOption {
  key: string; // "" = no filter
  label: string;
  count?: number;
  href: string;
  color?: string; // dot colour
}

// A "Filter by ..." dropdown for the audit logs. Every option is a real link, so the choice lives in the address bar.
export default function FilterMenu({ title, value, options }: { title: string; value: string; options: FilterOption[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="dd" ref={box}>
      <button className="dd-btn" onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open}>
        <span className="dd-title">{title}</span>
        <b className="trunc">{current.label}</b>
        <Icon d="chevD" size={14} sw={2} />
      </button>
      {open && (
        <div className="dd-menu" role="menu" aria-label={title}>
          {options.map((o) => (
            <Link key={o.key} href={o.href} replace scroll={false} role="menuitemradio" aria-checked={o.key === current.key} className="dd-item" onClick={() => setOpen(false)}>
              {o.color && <span className="dd-dot" style={{ background: o.color }} />}
              <span className="trunc">{o.label}</span>
              {o.count !== undefined && <small>{o.count}</small>}
              {o.key === current.key && <Icon d="check" size={14} sw={2.4} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
