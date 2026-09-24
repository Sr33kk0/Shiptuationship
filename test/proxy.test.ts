// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, createSession } from "@/lib/session";
import { config, proxy } from "@/proxy";

const valid = createSession({ id: "DanielHo", name: "Daniel Ho", role: "moderator" as const });
const auditor = createSession({ id: "AuditAnn", name: "Audit Ann", role: "auditor" as const });
const request = (path: string, cookie?: string, method = "GET") =>
  new NextRequest(`http://localhost${path}`, { method, headers: cookie === undefined ? {} : { cookie: `${SESSION_COOKIE}=${cookie}` } });

describe("proxy", () => {
  it("lets logged-in visitors through", () => {
    expect(proxy(request("/dashboard", valid)).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(request("/api/emails", valid)).headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a moderator make changes", () => {
    expect(proxy(request("/api/emails/email_001/read", valid, "POST")).headers.get("x-middleware-next")).toBe("1");
  });

  it("lets an auditor read everything but change nothing", async () => {
    for (const path of ["/dashboard", "/emails", "/shipments", "/audit/user", "/settings", "/api/emails", "/api/audit?source=user"]) {
      expect(proxy(request(path, auditor)).headers.get("x-middleware-next")).toBe("1");
    }
    for (const [path, method] of [["/api/emails/email_001/read", "POST"], ["/api/emails/email_001/review", "POST"], ["/api/auto-reply", "POST"], ["/api/emails", "PUT"], ["/api/emails", "DELETE"], ["/emails", "POST"]]) {
      const res = proxy(request(path, auditor, method));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Auditors have read-only access" });
    }
    expect(proxy(request("/api/session", auditor, "DELETE")).headers.get("x-middleware-next")).toBe("1"); // can still log out
  });

  it("lets anyone reach the log in route", () => {
    expect(proxy(request("/api/session", undefined, "POST")).headers.get("x-middleware-next")).toBe("1");
  });

  it("answers the data API with 401 when logged out or the cookie is not a valid session", async () => {
    for (const cookie of [undefined, "1", `${valid}x`]) {
      const res = proxy(request("/api/emails", cookie));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Log in to continue" });
    }
  });

  it("sends logged-out visitors of app pages to the front page", () => {
    const res = proxy(request("/emails?view=spam", "1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("guards the app pages and the API", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*", "/emails/:path*", "/shipments/:path*", "/audit/:path*", "/settings/:path*", "/api/:path*"]);
  });
});
