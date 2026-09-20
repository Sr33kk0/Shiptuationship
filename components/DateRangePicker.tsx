"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Icon } from "./Icon";

export interface DateRange {
  start: string; // "YYYY-MM-DD", or "" when not chosen
  end: string;
}

// ---- small local-date helpers (dates are plain "YYYY-MM-DD" strings, matching the emails' rawDate) ----
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const monthOf = (s: string) => {
  const d = parse(s);
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const label = (s: string, year = true) => parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
const daysIn = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000) + 1;

// "12 Sep – 20 Sep 2026", "12 Sep 2026" (one day), "From 12 Sep 2026" (only a start so far)
function rangeText({ start, end }: DateRange) {
  if (!start) return "";
  if (!end) return `From ${label(start)}`;
  if (start === end) return label(start);
  return parse(start).getFullYear() === parse(end).getFullYear() ? `${label(start, false)} – ${label(end)}` : `${label(start)} – ${label(end)}`;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // weeks start on Monday
const POP_W = 320;

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: Props) {
  const asSheet = useMediaQuery("(max-width: 1279px)"); // phones and tablets get a bottom sheet, desktops a popover
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState(() => monthOf(value.start || iso(new Date())));
  const [hover, setHover] = useState(""); // day under the pointer while the end date is still to be picked
  const [focusDay, setFocusDay] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);
  const complete = !!value.start && !!value.end;
  const today = iso(new Date());

  useEffect(() => () => clearTimeout(timer.current), []);

  const leave = () => {
    clearTimeout(timer.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOpen(false);
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180); // keep in step with the exit in globals.css
  };

  const show = () => {
    clearTimeout(timer.current);
    setClosing(false);
    setView(monthOf(value.start || today));
    setFocusDay(value.start || today);
    setHover("");
    setOpen(true);
  };

  // desktop popover: sit under the trigger, right-aligned to it, kept on screen, flipped above if there is no room below
  useLayoutEffect(() => {
    if (!open || asSheet) return;
    const t = trigger.current?.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 380;
    if (!t) return;
    const left = Math.min(Math.max(t.right - POP_W, 8), window.innerWidth - POP_W - 8);
    const below = t.bottom + 8;
    setPos({ left, top: below + h > window.innerHeight - 8 && t.top - 8 - h > 8 ? t.top - 8 - h : below });
  }, [open, asSheet, view]);

  // keyboard focus lands on the chosen (or today's) day when the calendar opens (once it is visible: a hidden element cannot take focus)
  const focused = useRef(false);
  const ready = asSheet || pos !== null;
  useEffect(() => {
    if (!open) {
      focused.current = false;
      return;
    }
    if (!ready || focused.current) return;
    focused.current = true;
    pop.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (d: string) => {
    if (!value.start || value.end) {
      onChange({ start: d, end: "" }); // first click: a new range starts here
      setHover("");
      return;
    }
    onChange(d < value.start ? { start: d, end: value.start } : { start: value.start, end: d }); // second click: the other end
    clearTimeout(timer.current);
    timer.current = window.setTimeout(leave, 550); // linger so the chosen range is seen highlighted before it closes
  };

  const moveFocus = (d: string) => {
    setFocusDay(d);
    setView(monthOf(d));
    requestAnimationFrame(() => pop.current?.querySelector<HTMLButtonElement>(`[data-day="${d}"]`)?.focus());
  };
  const onDayKey = (e: React.KeyboardEvent, d: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      moveFocus(addDays(d, step));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const n = parse(d);
      n.setMonth(n.getMonth() + (e.key === "PageUp" ? -1 : 1));
      moveFocus(iso(n));
    }
  };

  // what is highlighted: the chosen range, or start -> hovered day while the end is still to be picked
  const to = value.end || (value.start ? hover : "");
  const [a, b] = value.start && to ? (value.start <= to ? [value.start, to] : [to, value.start]) : [value.start, ""];

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const gridStart = addDays(iso(first), -((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const calendar = (
    <>
      <div className="dr-head">
        <button className="dr-nav prev" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="Previous month">
          <Icon d="chevR" size={16} sw={2.2} />
        </button>
        <b aria-live="polite">{view.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
        <button className="dr-nav" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="Next month">
          <Icon d="chevR" size={16} sw={2.2} />
        </button>
      </div>

      <div className="dr-grid" role="grid" onPointerLeave={() => setHover("")}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="dr-wd" role="columnheader">
            {w}
          </span>
        ))}
        {cells.map((d) => {
          const isEnd = d === a || d === b;
          const cls = ["dr-day", parse(d).getMonth() !== view.getMonth() ? "out" : "", d === today ? "today" : "", isEnd ? "end" : "", a && b && d > a && d < b ? "in" : "", a && b && d === a && a !== b ? "first" : "", a && b && d === b && a !== b ? "last" : ""].filter(Boolean).join(" ");
          return (
            <button key={d} data-day={d} className={cls} role="gridcell" tabIndex={d === focusDay ? 0 : -1} aria-selected={isEnd || undefined} aria-label={parse(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} onClick={() => pick(d)} onPointerEnter={() => value.start && !value.end && setHover(d)} onKeyDown={(e) => onDayKey(e, d)}>
              {parse(d).getDate()}
            </button>
          );
        })}
      </div>

      <div className="dr-foot">
        {complete ? (
          <p className="dr-range">
            <b>{rangeText(value)}</b>
            <small>{daysIn(value.start, value.end)} {daysIn(value.start, value.end) === 1 ? "day" : "days"}</small>
          </p>
        ) : (
          <p className="dr-hint">{value.start ? "Now pick an end date" : "Pick a start date"}</p>
        )}
        {value.start && (
          <button className="dr-clear" onClick={() => onChange({ start: "", end: "" })}>
            Clear
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="daterange">
      <button ref={trigger} className="dr-trigger" onClick={() => (open ? leave() : show())} aria-haspopup="dialog" aria-expanded={open}>
        <Icon d="cal" size={14} />
        <span className={value.start ? "dr-text" : "dr-placeholder"}>{value.start ? rangeText(value) : "Select dates"}</span>
        {complete && value.start !== value.end && <small className="dr-days">{daysIn(value.start, value.end)} days</small>}
      </button>
      {value.start && (
        <button className="clear inline" onClick={() => onChange({ start: "", end: "" })} title="Clear date range" aria-label="Clear date range">
          <Icon d="x" size={14} sw={2} />
        </button>
      )}

      {open &&
        createPortal(
          asSheet ? (
            <div className={`sheet-overlay${closing ? " closing" : ""}`} onClick={leave}>
              <div ref={pop} className="sheet dr-sheet" role="dialog" aria-modal="true" aria-label="Choose a date range" onClick={(e) => e.stopPropagation()}>
                <div className="sheet-grab" aria-hidden="true" />
                <div className="sheet-head">
                  <h3>Select dates</h3>
                  <button className="sheet-x" onClick={leave} aria-label="Close">
                    <Icon d="x" size={18} sw={2} />
                  </button>
                </div>
                {calendar}
              </div>
            </div>
          ) : (
            <div className="dr-overlay" onClick={leave}>
              <div ref={pop} className={`dr-pop${closing ? " closing" : ""}`} style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: POP_W, visibility: pos ? "visible" : "hidden" }} role="dialog" aria-label="Choose a date range" onClick={(e) => e.stopPropagation()}>
                {calendar}
              </div>
            </div>
          ),
          document.body,
        )}
    </div>
  );
}
