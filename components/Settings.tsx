"use client";

import { useEffect, useRef, useState } from "react";
import { SCALES, THEMES, setScale, setTheme, useScale, useTheme } from "@/lib/theme";
import { Icon } from "./Icon";
import Profile from "./Profile";

const pct = (s: number) => `${Math.round(s * 100)}%`;

export default function Settings() {
  const theme = useTheme();
  const scale = useScale();

  // The slider moves through the SCALES stops. The page only rescales on release (the native change event, which
  // React's onChange does not separate from input), so the slider does not grow under the pointer mid-drag.
  const [draft, setDraft] = useState<number | null>(null);
  const slider = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = slider.current!;
    const commit = () => {
      setScale(SCALES[+el.value]);
      setDraft(null);
    };
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  }, []);
  const at = draft ?? (SCALES.includes(scale) ? SCALES.indexOf(scale) : SCALES.indexOf(1));

  return (
    <div className="scroll">
      <header className="page-head fade-up">
        <div>
          <h1>Settings</h1>
          <p>Personalise how Shiptuationship looks on this device.</p>
        </div>
        <Profile />
      </header>

      <section className="panel fade-up" style={{ "--d": "0.12s" } as React.CSSProperties}>
        <h3 className="card-title">Colour scheme</h3>
        <p className="bars-note">Pick a look. It applies straight away and is remembered in this browser.</p>

        <div className="theme-grid" role="radiogroup" aria-label="Colour scheme">
          {THEMES.map((t) => (
            <button key={t.id} className="theme-card" role="radio" aria-checked={theme === t.id} onClick={() => setTheme(t.id)}>
              <span className="theme-prev" style={{ background: t.swatch[0] }} aria-hidden="true">
                <span className="tp-nav">
                  <i style={{ background: t.swatch[3] }} />
                  <i style={{ background: t.swatch[3] }} />
                  <i style={{ background: t.swatch[3] }} />
                </span>
                <span className="tp-card" style={{ background: t.swatch[1] }}>
                  <i className="tp-line" style={{ background: t.swatch[3] }} />
                  <i className="tp-line short" style={{ background: t.swatch[3] }} />
                  <i className="tp-chip" style={{ background: t.swatch[2] }} />
                </span>
              </span>
              <span className="theme-name">
                <b>{t.label}</b>
                {theme === t.id && <Icon d="check" size={16} sw={2.6} />}
              </span>
              <small>{t.note}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel fade-up" style={{ "--d": "0.2s" } as React.CSSProperties}>
        <h3 className="card-title">Interface size</h3>
        <p className="bars-note">Make text, buttons and spacing bigger or smaller. Applies when you let go, and is also remembered in this browser.</p>

        <div className="scale">
          <input ref={slider} type="range" min={0} max={SCALES.length - 1} step={1} value={at} list="scale-stops" aria-label="Interface size" aria-valuetext={pct(SCALES[at])} onChange={(e) => setDraft(+e.target.value)} />
          <datalist id="scale-stops">
            {SCALES.map((_, i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
          <div className="scale-stops" aria-hidden="true">
            {SCALES.map((s, i) => (
              <span key={s} className={i === at ? "on" : undefined}>
                {pct(s)}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
