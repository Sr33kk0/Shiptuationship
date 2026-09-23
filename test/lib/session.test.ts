import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, logIn, logOut } from "@/lib/session";

const assign = vi.fn();
beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session", () => {
  it("logs in with a browser-session cookie and loads the dashboard", () => {
    logIn();
    expect(document.cookie).toContain(`${SESSION_COOKIE}=1`);
    expect(assign).toHaveBeenCalledWith("/dashboard");
  });

  it("logs out by expiring the cookie and going to the front page", () => {
    logIn();
    logOut();
    expect(document.cookie).not.toContain(SESSION_COOKIE);
    expect(assign).toHaveBeenLastCalledWith("/");
  });
});
