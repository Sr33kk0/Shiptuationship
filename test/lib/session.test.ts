// @vitest-environment node
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPassword, createSession, readSession } from "@/lib/session";

const me = { id: "DanielHo", name: "Daniel Ho" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session cookie", () => {
  it("reads back the moderator it was made for", () => {
    expect(readSession(createSession(me))).toEqual(me);
  });

  it("rejects a missing, edited or forged cookie", () => {
    const [payload, sig] = createSession(me).split(".");
    const edited = Buffer.from(JSON.stringify({ id: "Someone", name: "x", exp: Date.now() + 1e9 })).toString("base64url");
    for (const value of [undefined, "", "1", payload, `${payload}.`, `${edited}.${sig}`, `${payload}.${sig.slice(1)}`, `${payload}.é${sig}`]) {
      expect(readSession(value)).toBeNull();
    }
  });

  it("expires after 12 hours", () => {
    vi.useFakeTimers();
    const value = createSession(me);
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 - 1);
    expect(readSession(value)).toEqual(me);
    vi.advanceTimersByTime(1);
    expect(readSession(value)).toBeNull();
  });

  it("stops working when the secret changes, and refuses a short secret", () => {
    const value = createSession(me);
    vi.stubEnv("SESSION_SECRET", "another-secret-that-is-at-least-32-chars");
    expect(readSession(value)).toBeNull();
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => createSession(me)).toThrow("SESSION_SECRET");
  });
});

describe("checkPassword", () => {
  // the hash `npm run hash-password` makes, so the script and the check agree on the format
  const hash = execFileSync("npm", ["run", "--silent", "hash-password", "--", "correct-horse"], { encoding: "utf8", shell: true }).trim();

  it("accepts the password the hash was made from, and nothing else", () => {
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(checkPassword("correct-horse", hash)).toBe(true);
    expect(checkPassword("correct-horsE", hash)).toBe(false);
    expect(checkPassword("", hash)).toBe(false);
  });

  it("rejects a malformed stored hash", () => {
    for (const stored of ["", ":", "abc", "abc:", ":abc", "abc:zz"]) expect(checkPassword("x", stored)).toBe(false);
  });
});
