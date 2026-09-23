"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Moderator } from "@/lib/session";
import { Icon } from "./Icon";

// The logged-in moderator, read from the session cookie by app/layout.tsx.
const Me = createContext<Moderator>({ id: "", name: "" });
export function ModeratorProvider({ value, children }: { value: Moderator; children: React.ReactNode }) {
  return <Me value={value}>{children}</Me>;
}

function logOut() {
  fetch("/api/session", { method: "DELETE" }).finally(() => window.location.assign("/")); // a full load, so the server renders the front page
}

// Avatar + name and role, top right of each page. On phones and small tablets (top bar) only the avatar shows; the name and role move into the menu.
// Clicking it opens a menu with Log out.
export default function Profile() {
  const me = useContext(Me);
  const user = { name: me.name, initials: me.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(), role: "Moderator", handle: me.id };
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current?.contains(e.target as Node) || setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="profile" ref={box}>
      <button className="profile-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`${user.name}, account menu`}>
        <div className="avatar">{user.initials}</div>
        <div className="profile-text">
          <h4 className="trunc">{user.name}</h4>
          <small className="trunc">
            {user.role}
            <span className="handle"> · {user.handle}</span>
          </small>
        </div>
        <span className="chev">
          <Icon d="chevD" size={14} sw={2.2} />
        </span>
      </button>
      {open && (
        <div className="pm" role="menu">
          <div className="pm-id">
            <b>{user.name}</b>
            <small>
              {user.role} · {user.handle}
            </small>
          </div>
          <button className="pm-item" role="menuitem" onClick={logOut}>
            <Icon d="logout" size={16} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
