// @vitest-environment node
import { scryptSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findModerator } from "@/lib/firestore";
import { SESSION_COOKIE, readSession } from "@/lib/session";
import { DELETE, POST } from "@/app/api/session/route";

vi.mock("@/lib/firestore", () => ({ findModerator: vi.fn() }));
const find = vi.mocked(findModerator);
const salt = "00".repeat(16);
const daniel = { id: "DanielHo", name: "Daniel Ho", role: "moderator" as const, passwordHash: `${salt}:${scryptSync("s3cret", salt, 64).toString("hex")}` };
const post = (body: unknown) => POST(new Request("http://localhost/api/session", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const cookieOf = (res: Response) => res.headers.get("set-cookie") ?? "";

beforeEach(() => {
  find.mockReset();
});

describe("POST /api/session", () => {
  it("logs in a moderator whose password matches, with a signed HttpOnly cookie", async () => {
    find.mockResolvedValue(daniel);
    const res = await post({ username: "  DanielHo ", password: "s3cret" });
    expect(res.status).toBe(204);
    expect(find).toHaveBeenCalledWith("danielho");
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    const value = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1];
    expect(readSession(decodeURIComponent(value))).toEqual({ id: "DanielHo", name: "Daniel Ho", role: "moderator" });
  });

  it("carries an auditor's role into the session", async () => {
    find.mockResolvedValue({ ...daniel, role: "auditor" });
    const res = await post({ username: "danielho", password: "s3cret" });
    const value = cookieOf(res).match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))![1];
    expect(readSession(decodeURIComponent(value))?.role).toBe("auditor");
  });

  it("gives the same answer for a wrong password, an unknown username and a moderator without a password", async () => {
    for (const moderator of [daniel, null, { ...daniel, passwordHash: "" }]) {
      find.mockResolvedValueOnce(moderator);
      const res = await post({ username: "danielho", password: "wrong" });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Wrong username or password" });
      expect(cookieOf(res)).toBe("");
    }
  });

  it("refuses a missing or malformed body without looking anyone up", async () => {
    expect((await post("not json")).status).toBe(400);
    for (const body of [{}, { username: "danielho" }, { username: " ", password: "x" }, { username: 1, password: "x" }, { username: "x".repeat(101), password: "x" }, { username: "danielho", password: "x".repeat(201) }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Enter your username and password" });
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("hides Firestore errors behind a generic 502 and logs the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("Firestore 500: secret detail");
    find.mockRejectedValue(cause);
    const res = await post({ username: "danielho", password: "x" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Could not log in. Please try again." });
    expect(log).toHaveBeenCalledWith("Log in: moderator lookup failed", cause);
    log.mockRestore();
  });
});

describe("DELETE /api/session", () => {
  it("logs out by expiring the cookie", async () => {
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toMatch(new RegExp(`${SESSION_COOKIE}=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)`, "i"));
  });
});
