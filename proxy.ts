import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Logged-out visitors get the front page only: app pages send them back to it and the data API answers 401.
export function proxy(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Log in to continue" }, { status: 401 });
  return NextResponse.redirect(new URL("/", req.url));
}

export const config = { matcher: ["/dashboard/:path*", "/emails/:path*", "/audit/:path*", "/settings/:path*", "/api/:path*"] };
