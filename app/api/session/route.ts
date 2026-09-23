import { NextResponse } from "next/server";
import { findModerator } from "@/lib/firestore";
import { SESSION_COOKIE, checkPassword, createSession } from "@/lib/session";

const fail = (error: string, status: number) => Response.json({ error }, { status });

// Log in with the username and password of a `moderators` document (moderator or auditor, by its `role`). The only route proxy.ts lets through without a session.
// ponytail: no attempt limit, scrypt slows guessing; add a per-username lockout in Firestore if the app goes public
export async function POST(req: Request) {
  let username: unknown, password: unknown;
  try {
    ({ username, password } = await req.json());
  } catch {
    return fail("Body must be JSON", 400);
  }
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 100 || password.length > 200) {
    return fail("Enter your username and password", 400);
  }

  let moderator;
  try {
    moderator = await findModerator(username.trim().toLowerCase());
  } catch (e) {
    console.error("Log in: moderator lookup failed", e); // the visitor gets a generic message; the reason goes to the server logs
    return fail("Could not log in. Please try again.", 502);
  }
  if (!moderator?.passwordHash || !checkPassword(password, moderator.passwordHash)) return fail("Wrong username or password", 401);

  const res = new NextResponse(null, { status: 204 });
  // No maxAge: the cookie ends when the browser closes, and the signed expiry inside it ends it after 12 h regardless.
  res.cookies.set(SESSION_COOKIE, createSession({ id: moderator.id, name: moderator.name, role: moderator.role }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}

// Log out.
export async function DELETE() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
