import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// Logged-out visitors get the front page only: app pages send them back to it and the data API answers 401.
// A session counts only if its cookie is signed and unexpired (lib/session.ts). /api/session is open, it is how you log in and out.
// Auditors are read-only: anything but GET or HEAD (every write, the AI reply, any future server action) answers 403.
export function proxy(req: NextRequest) {
  // SameSite cookies still accompany requests from sibling subdomains. Check the
  // full origin for every write, including login/logout, before any route runs.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if ((origin !== null && origin !== req.nextUrl.origin) ||
        ["cross-site", "same-site"].includes(req.headers.get("sec-fetch-site") ?? "")) {
      return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
    }
  }
  if (req.nextUrl.pathname === "/api/session") return NextResponse.next();
  const session = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Log in to continue" }, { status: 401 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (session.role !== "moderator" && req.method !== "GET" && req.method !== "HEAD") return NextResponse.json({ error: "Auditors have read-only access" }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/emails/:path*", "/shipments/:path*", "/audit/:path*", "/settings/:path*", "/api/:path*"] };
