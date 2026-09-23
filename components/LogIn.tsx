"use client";

import { useState } from "react";
import { Icon } from "./Icon";

// Sign-in form for moderators and auditors; app/api/session checks the username and password against the `moderators` collection in Firestore.
// There is no sign-up.
export default function LogIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logIn(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") }),
      });
      if (res.ok) return window.location.assign("/dashboard"); // a full load, so the server renders the app instead of the front page
      setError((await res.json()).error ?? "Could not log in. Please try again.");
    } catch {
      setError("Could not log in. Please try again.");
    }
    setBusy(false);
  }

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
            logIn(e.currentTarget);
          }}
        >
          <h1>Log in</h1>
          <p>Welcome back. Pick up the review queue where you left it.</p>

          <label htmlFor="username">Username</label>
          <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="danielho" required autoFocus />

          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />

          <button className="site-btn dark lg" type="submit" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>

          {error && (
            <div className="login-note" role="alert">
              <Icon d="alert" size={16} />
              <span>{error}</span>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
