"use client";

import { useEffect, useRef } from "react";
import { serializeEmails } from "@/lib/exportEmails";
import type { Shipment } from "@/lib/shipments";
import { Icon } from "./Icon";
import { useToast } from "./Shell";

export default function ExportEmails({ rows, disabled }: { rows: Shipment[]; disabled: boolean }) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  const showToast = useToast();
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) dropdown.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const download = (format: "csv" | "json") => {
    if (disabled) return;
    try {
      const blob = new Blob([serializeEmails(rows, format)], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `emails-${new Date().toISOString().replaceAll(":", "-")}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Exported ${rows.length} emails as ${format.toUpperCase()}`);
    } catch {
      showToast("Export failed. Please try again.");
    }
    if (dropdown.current) {
      dropdown.current.open = false;
      dropdown.current.querySelector("summary")?.focus();
    }
  };

  return (
    <details ref={dropdown} className="email-export" onKeyDown={(e) => {
      if (e.key === "Escape" && dropdown.current) {
        dropdown.current.open = false;
        dropdown.current.querySelector("summary")?.focus();
      }
    }} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false;
    }}>
      <summary aria-disabled={disabled} onClick={(e) => { if (disabled) e.preventDefault(); }}>
        <Icon d="download" size={15} /> Export <Icon d="chevD" size={13} />
      </summary>
      <div className="email-export-options">
        <p>{rows.length} matching emails</p>
        <button disabled={disabled} onClick={() => download("csv")}>Export CSV</button>
        <button disabled={disabled} onClick={() => download("json")}>Export JSON</button>
      </div>
    </details>
  );
}
