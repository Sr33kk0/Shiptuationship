import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AuditPage from "@/app/audit/page";
import SystemLogPage from "@/app/audit/system/page";
import UserLogPage from "@/app/audit/user/page";
import DashboardPage from "@/app/dashboard/page";
import EmailsPage from "@/app/emails/page";
import RootLayout, { metadata, viewport } from "@/app/layout";
import HomePage from "@/app/page";
import SettingsPage from "@/app/settings/page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/font/google", () => ({ Figtree: () => ({ variable: "font-figtree" }) }));
vi.mock("@/components/AuditLog", () => ({ default: ({ source }: { source: string }) => <main>audit:{source}</main> }));
vi.mock("@/components/Dashboard", () => ({ default: () => <main>dashboard</main> }));
vi.mock("@/components/Emails", () => ({ default: () => <main>emails</main> }));
vi.mock("@/components/Settings", () => ({ default: () => <main>settings</main> }));
vi.mock("@/components/Landing", () => ({ default: () => <main>landing</main> }));
vi.mock("@/components/Shell", () => ({ default: ({ children }: { children: ReactNode }) => <div className="shell">{children}</div> }));
vi.mock("@/lib/useShipments", () => ({ ShipmentsProvider: ({ children }: { children: ReactNode }) => <div className="provider">{children}</div> }));

const html = (el: ReactElement) => renderToStaticMarkup(el);
const loggedIn = (yes: boolean) => vi.mocked(cookies).mockResolvedValue({ has: (name: string) => yes && name === "shiptuationship-session" } as never);

beforeEach(() => {
  vi.mocked(redirect).mockClear();
});

describe("app pages", () => {
  it("render their component", () => {
    expect(html(<DashboardPage />)).toBe("<main>dashboard</main>");
    expect(html(<EmailsPage />)).toBe("<main>emails</main>");
    expect(html(<SettingsPage />)).toBe("<main>settings</main>");
    expect(html(<UserLogPage />)).toBe("<main>audit:user</main>");
    expect(html(<SystemLogPage />)).toBe("<main>audit:system</main>");
  });

  it("send the old audit address to the user log", () => {
    AuditPage();
    expect(redirect).toHaveBeenCalledWith("/audit/user");
  });

  it("show the front page to logged-out visitors", async () => {
    loggedIn(false);
    expect(html((await HomePage())!)).toBe("<main>landing</main>");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("send logged-in visitors from the front page to the dashboard", async () => {
    loggedIn(true);
    await HomePage();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});

describe("RootLayout", () => {
  it("wraps the app in the data provider and shell, with the saved colour scheme, once logged in", async () => {
    loggedIn(true);
    const page = html(await RootLayout({ children: <p>child</p> }));
    expect(page).toContain('<body class="font-figtree"><div class="provider"><div class="shell"><p>child</p></div></div></body>');
    expect(page).toContain('localStorage.getItem("shiptuationship-theme")');
  });

  it("renders the front page bare and in the default scheme when logged out", async () => {
    loggedIn(false);
    const page = html(await RootLayout({ children: <p>child</p> }));
    expect(page).toContain('<body class="font-figtree"><p>child</p></body>');
    expect(page).not.toContain("localStorage");
  });

  it("describes the site for link previews", () => {
    expect(metadata.title).toBe("Shiptuationship: AI Logistics Assistant");
    expect(metadata.openGraph).toMatchObject({ images: [{ url: "/opengraph.png", width: 1200, height: 630 }] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(String(metadata.metadataBase)).toBe("http://localhost:3000/");
    expect(viewport).toMatchObject({ width: "device-width", viewportFit: "cover" });
  });
});
