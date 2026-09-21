"use client";

import { useEffect, useRef, useState } from "react";
import { logOut } from "@/lib/session";
import { Icon } from "./Icon";

// Preset demo identity, the same one the server acts as (see MODERATOR in lib/firestore.ts).
const USER = { name: "Daniel Ho", initials: "DH", role: "Moderator", handle: "DanielHo" };

// Avatar + name and role, top right of each page. On phones and small tablets (top bar) only the avatar shows; the name and role move into the menu.
// Clicking it opens a menu with Log out.
export default function Profile() {
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
      <button className="profile-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`${USER.name}, account menu`}>
        <div className="avatar">{USER.initials}</div>
        <div className="profile-text">
          <h4 className="trunc">{USER.name}</h4>
          <small className="trunc">
            {USER.role}
            <span className="handle"> · {USER.handle}</span>
          </small>
        </div>
        <span className="chev">
          <Icon d="chevD" size={14} sw={2.2} />
        </span>
      </button>
      {open && (
        <div className="pm" role="menu">
          <div className="pm-id">
            <b>{USER.name}</b>
            <small>
              {USER.role} · {USER.handle}
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
