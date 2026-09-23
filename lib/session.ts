// Server-only: the signed session cookie and moderator passwords. Never import this from a client component.
// There is no sign-up: a moderator is a `moderators/{id}` document in Firestore with a `username` and a `password_hash`
// (made with `npm run hash-password`), and logging in (app/api/session) checks the password against that hash.
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "shiptuationship-session";
const TTL = 12 * 60 * 60 * 1000; // ponytail: a copied cookie stops working after 12 h; no server-side revocation, keep a session list in Firestore if one is needed

// "auditor" is read-only: proxy.ts refuses every request of theirs that is not GET or HEAD, and the UI hides the actions.
export type Role = "moderator" | "auditor";
export type Moderator = { id: string; name: string; role: Role };

function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Missing SESSION_SECRET (32+ characters) in .env.local");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

// The cookie value: the moderator and an expiry, signed so it cannot be edited or made up.
export function createSession(moderator: Moderator): string {
  const payload = Buffer.from(JSON.stringify({ ...moderator, exp: Date.now() + TTL })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// The moderator a cookie belongs to, or null when it is missing, forged or expired.
export function readSession(value: string | undefined): Moderator | null {
  const [payload, sig] = (value ?? "").split(".");
  if (!payload || !sig || !same(Buffer.from(sig), Buffer.from(sign(payload)))) return null;
  const { id, name, role, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
  return exp > Date.now() ? { id, name, role: role === "moderator" ? "moderator" : "auditor" } : null; // anything but "moderator" is read-only
}

export const currentModerator = async () => readSession((await cookies()).get(SESSION_COOKIE)?.value);

// `password_hash` is "salt:hash" in hex, scrypt with a 64-byte key: the format `npm run hash-password -- "<password>"` prints.
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return !!salt && !!hash && same(Buffer.from(hash, "hex"), scryptSync(password, salt, 64));
}
