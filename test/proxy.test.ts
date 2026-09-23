// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/session";
import { config, proxy } from "@/proxy";

const request = (path: string, loggedIn: boolean) =>
  new NextRequest(`http://localhost${path}`, { headers: loggedIn ? { cookie: `${SESSION_COOKIE}=1` } : {} });

describe("proxy", () => {
  it("lets logged-in visitors through", () => {
    expect(proxy(request("/dashboard", true)).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/emails", true)).headers.get("x-middleware-next")).toBe("1");
  });

  it("answers the data API with 401 when logged out", async () => {
    const res = proxy(request("/api/emails", false));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Log in to continue" });
  });

  it("sends logged-out visitors of app pages to the front page", () => {
    const res = proxy(request("/emails?view=spam", false));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("guards the app pages and the API", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*", "/emails/:path*", "/audit/:path*", "/settings/:path*", "/api/:path*"]);
  });
});
