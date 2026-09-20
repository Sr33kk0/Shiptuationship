"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Icon } from "./Icon";
import Profile from "./Profile";

const ToastContext = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

// Moves to another page after fading the current one out, so the swap isn't instant.
const NavContext = createContext<(href: string) => void>(() => {});
export const useNavigate = () => useContext(NavContext);

// A normal Link (middle-click, ctrl-click and the address preview still work) that goes through the fade.
export function NavLink({ href, onClick, ...props }: ComponentProps<typeof Link>) {
  const navigate = useNavigate();
  return (
    <Link
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(String(href));
      }}
      {...props}
    />
  );
}

const PAGES = [
  { href: "/", label: "Dashboard Overview", icon: "dashboard" },
  { href: "/emails", label: "Emails", icon: "mail" },
  { href: "/audit/user", label: "User Log", icon: "user" },
  { href: "/audit/system", label: "System Log", icon: "chip" },
] as const;

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [target, setTarget] = useState<string | null>(null); // page being navigated to, so the menu highlight moves on click
  const [hl, setHl] = useState<{ y: number; h: number } | null>(null);
  const menuRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false); // the icon-only sidebar (desktop)
  const [drawer, setDrawer] = useState(false); // the slide-in menu (phones and small tablets)
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);

  // At this width the sidebar becomes a drawer opened from a top bar; keep in step with the CSS breakpoint in globals.css.
  const isMobile = useMediaQuery("(max-width: 900px)");
  const compact = collapsed && !isMobile; // the drawer always shows full labels

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    // the new page has arrived
    setLeaving(false);
    setTarget(null);
    setDrawer(false);
  }, [pathname]);
  useEffect(() => {
    if (!isMobile) setDrawer(false);
  }, [isMobile]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  // One highlight slides between the menu items; measured so it also fits the collapsed sidebar.
  const current = target ?? pathname;
  useLayoutEffect(() => {
    const el = menuRef.current?.querySelector<HTMLElement>(".nav-item.active");
    if (el) setHl({ y: el.offsetTop, h: el.offsetHeight });
  }, [current, compact]);

  const navigate = (href: string) => {
    setDrawer(false);
    const slow = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!slow || href.split("?")[0] === pathname) return router.push(href); // same page: no fade
    setLeaving(true);
    setTarget(href.split("?")[0]);
    window.setTimeout(() => router.push(href), 120);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3000);
  };

  return (
    <NavContext.Provider value={navigate}>
      <div className={`shell${compact ? " collapsed" : ""}${drawer ? " drawer-open" : ""}`}>
        {toast && (
          <div className="toast" role="status">
            <span className="toast-ic">
              <Icon d="check" size={14} sw={2.2} />
            </span>
            {toast}
          </div>
        )}

        {/* phones and small tablets: a slim top bar opens the sidebar as a drawer */}
        <header className="topbar">
          <button className="topbar-btn" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} aria-controls="sidebar">
            <Icon d="menu" size={22} sw={2} />
          </button>
          <NavLink href="/" className="topbar-home" aria-label="Skymetrics, go to the dashboard">
            <div className="logo sm">
              <img src="/shiplogo.svg" alt="" />
            </div>
            <span className="topbar-title trunc">Skymetrics</span>
          </NavLink>
          <Profile />
        </header>
        <div className="backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />

        <aside className="sidebar" id="sidebar" inert={isMobile && !drawer}>
          <div className="sb-body">
            <div className="sb-head">
              <NavLink href="/" className="brand" title="Go to the dashboard" aria-label="Skymetrics, go to the dashboard">
                <div className="logo">
                  <img src="/shiplogo.svg" alt="" />
                </div>
                {!compact && (
                  <div style={{ minWidth: 0 }}>
                    <h2 className="trunc">Skymetrics</h2>
                    <small className="trunc">Ocean Manifest Desk</small>
                  </div>
                )}
              </NavLink>
              <button className="sb-close" onClick={() => setDrawer(false)} aria-label="Close menu">
                <Icon d="x" size={20} sw={2} />
              </button>
            </div>

            {/* inside the bar, left-aligned like every other row, so the icon glides with the padding instead of jumping (desktop only) */}
            <button className="nav-item sb-collapse" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              <Icon d={collapsed ? "expand" : "collapse"} sw={2} />
              {!compact && <span>Collapse</span>}
            </button>

            <div className="sb-group">
              {!compact && <span className="sb-label">Menu</span>}
              <nav className={`sb-nav${hl ? " has-hl" : ""}`} ref={menuRef}>
                {hl && <span className="nav-hl" style={{ transform: `translateY(${hl.y}px)`, height: hl.h }} />}
                {PAGES.map((p) => (
                  <NavLink key={p.href} href={p.href} className={`nav-item primary${current === p.href ? " active" : ""}`} title={p.label} aria-current={pathname === p.href ? "page" : undefined}>
                    <Icon d={p.icon} size={18} />
                    {!compact && <span>{p.label}</span>}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="sb-group">
              {!compact && <span className="sb-label">System &amp; Rules</span>}
              <nav className="sb-nav">
                {(
                  [
                    ["Carrier Directory", "ship", "Carrier Directory: Maersk, MSC, Cosco connected."],
                    ["Matching Rules", "filter", "Tolerance Rules: Gross weight ±50kg, container count exact match."],
                  ] as const
                ).map(([label, icon, msg]) => (
                  <button
                    key={label}
                    className="nav-item"
                    onClick={() => {
                      setDrawer(false);
                      showToast(msg);
                    }}
                    title={label}
                  >
                    {compact ? (
                      <Icon d={icon} />
                    ) : (
                      <>
                        <span>{label}</span>
                        <Icon d="chevR" sw={2} />
                      </>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        <main className={`main${leaving ? " leaving" : ""}`}>
          <ToastContext.Provider value={showToast}>{children}</ToastContext.Provider>
        </main>
      </div>
    </NavContext.Provider>
  );
}
