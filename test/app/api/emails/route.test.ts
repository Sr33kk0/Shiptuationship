// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listEmails } from "@/lib/firestore";
import { GET, dynamic } from "@/app/api/emails/route";

vi.mock("@/lib/firestore", () => ({ listEmails: vi.fn() }));
const list = vi.mocked(listEmails);

beforeEach(() => {
  list.mockReset();
});

describe("GET /api/emails", () => {
  it("is never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns every email", async () => {
    list.mockResolvedValue([{ id: "email_001" }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "email_001" }]);
  });

  it("reports a Firestore failure as 502", async () => {
    list.mockRejectedValue(new Error("Missing GOOGLE_CLIENT_ID"));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Missing GOOGLE_CLIENT_ID" });
  });
});
