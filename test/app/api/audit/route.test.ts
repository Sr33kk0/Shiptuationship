// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAuditLog } from "@/lib/firestore";
import { GET, dynamic } from "@/app/api/audit/route";

vi.mock("@/lib/firestore", () => ({ listAuditLog: vi.fn() }));
const list = vi.mocked(listAuditLog);
const get = (query: string) => GET(new Request(`http://localhost/api/audit${query}`));

beforeEach(() => {
  list.mockReset();
});

describe("GET /api/audit", () => {
  it("is never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("rejects a missing or unknown source", async () => {
    for (const query of ["", "?source=admin"]) {
      const res = await get(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "source must be user or system" });
    }
    expect(list).not.toHaveBeenCalled();
  });

  it("returns the requested log", async () => {
    list.mockResolvedValue([{ id: "x" }] as never);
    for (const source of ["user", "system"] as const) {
      const res = await get(`?source=${source}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: "x" }]);
      expect(list).toHaveBeenLastCalledWith(source);
    }
  });

  it("returns both logs for one email, newest first", async () => {
    list.mockImplementation(async (source) => (source === "user" ? [{ id: "u", at: "2026-03-05T02:00:00Z" }] : [{ id: "s1", at: "2026-03-05T03:00:00Z" }, { id: "s2", at: "2026-03-05T01:00:00Z" }]) as never);
    const res = await get("?email=email%2F2");
    expect(res.status).toBe(200);
    expect((await res.json()).map((e: { id: string }) => e.id)).toEqual(["s1", "u", "s2"]);
    expect(list.mock.calls).toEqual([["user", "email/2"], ["system", "email/2"]]);
  });

  it("reports a Firestore failure as 502", async () => {
    list.mockRejectedValue(new Error("Firestore 500: down"));
    const res = await get("?source=user");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Firestore 500: down" });
  });
});
