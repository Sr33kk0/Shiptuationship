"use client";

import { useState } from "react";
import { logIn } from "@/lib/session";
import { Icon } from "./Icon";

// Demo sign-in form: any email and password pass (see lib/session.ts), the browser's own validation checks the email format.
export default function LogIn() {
  const [busy, setBusy] = useState(false);

  return (
    <div className="site login">
      <aside className="login-side">
        <a className="site-brand" href="/" aria-label="Shiptuationship, home">
          <div className="logo">
            <img src="/shiplogo.svg" alt="" />
          </div>
          <span>Shiptuationship</span>
        </a>
        <div className="fade-up">
          <h2>Every SI checked against its Draft BL, before the ship sails.</h2>
          <ul className="login-points">
            {["Shipping email sorted as it arrives", "Seven fields compared by fixed rules", "Every review kept in the audit log"].map((t) => (
              <li key={t}>
                <Icon d="check" size={16} sw={2.4} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <small>Shiptuationship · AI Logistics Tool</small>
      </aside>

      <main className="login-main">
        <a className="login-back" href="/">
          <Icon d="chevL" size={14} sw={2.2} />
          Back to home
        </a>
        <form
          className="login-form fade-up"
          style={{ "--d": "0.1s" } as React.CSSProperties}
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            logIn();
          }}
        >
          <h1>Log in</h1>
          <p>Welcome back. Pick up the review queue where you left it.</p>

          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required autoFocus />

          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />

          <button className="site-btn dark lg" type="submit" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>

          <div className="login-note" role="note">
            <Icon d="alert" size={16} />
            <span>Demo access: any email and password signs you in as Daniel Ho, Moderator.</span>
          </div>
        </form>
      </main>
    </div>
  );
}
