"use client";

import { THEMES, setTheme, useTheme } from "@/lib/theme";
import { Icon } from "./Icon";
import Profile from "./Profile";

export default function Settings() {
  const theme = useTheme();

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
    </div>
  );
}
