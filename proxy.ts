import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// Logged-out visitors get the front page only: app pages send them back to it and the data API answers 401.
// A session counts only if its cookie is signed and unexpired (lib/session.ts). /api/session is open, it is how you log in.
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/session" || readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Log in to continue" }, { status: 401 });
  return NextResponse.redirect(new URL("/", req.url));
}

export const config = { matcher: ["/dashboard/:path*", "/emails/:path*", "/audit/:path*", "/settings/:path*", "/api/:path*"] };
