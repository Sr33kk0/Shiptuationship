// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveModeratorAction } from "@/lib/firestore";
import { currentModerator } from "@/lib/session";
import { fields } from "@/test/fixtures";
import { POST, dynamic } from "@/app/api/emails/[id]/review/route";

vi.mock("@/lib/firestore", () => ({ saveModeratorAction: vi.fn() }));
vi.mock("@/lib/session", () => ({ currentModerator: vi.fn() }));
const save = vi.mocked(saveModeratorAction);
const post = (body: unknown, id = "email_001") =>
  POST(new Request(`http://localhost/api/emails/${id}/review`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const error = async (res: Response) => ((await res.json()) as { error: string }).error;

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ id: "email_001" } as never);
  vi.mocked(currentModerator).mockResolvedValue({ id: "DanielHo", name: "Daniel Ho", role: "moderator" });
});

describe("POST /api/emails/[id]/review", () => {
  it("is never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("saves the SI and BL together", async () => {
    const res = await post({ si: fields(), bl: fields({ shipper: "X" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "email_001" });
    expect(save).toHaveBeenCalledWith("DanielHo", "email_001", { si: fields(), bl: fields({ shipper: "X" }) });
  });

  it("refuses an auditor, who is read-only", async () => {
    vi.mocked(currentModerator).mockResolvedValue({ id: "AuditAnn", name: "Audit Ann", role: "auditor" });
    const res = await post({ si: fields(), bl: fields() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Auditors have read-only access" });
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses without a valid session", async () => {
    vi.mocked(currentModerator).mockResolvedValue(null);
    const res = await post({ si: fields(), bl: fields() });
    expect([res.status, await error(res)]).toEqual([401, "Log in to continue"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a bad id", async () => {
    const res = await post({ si: fields(), bl: fields() }, "a.b");
    expect([res.status, await error(res)]).toEqual([400, "Invalid email id"]);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await post("{nope");
    expect([res.status, await error(res)]).toEqual([400, "Body must be JSON"]);
  });

  it("rejects a document that is missing or not an object", async () => {
    for (const bad of [undefined, null, "x", [1]]) {
      const res = await post({ si: fields(), bl: bad });
      expect([res.status, await error(res)]).toEqual([400, "bl must be an object"]);
    }
    const res = await post({ bl: fields() });
    expect([res.status, await error(res)]).toEqual([400, "si must be an object"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("requires exactly the seven fields as strings of at most 500 characters", async () => {
    const { shipper: _, ...six } = fields();
    for (const bad of [six, { ...fields(), extra: "x" }, { ...fields(), containerCount: 3 }, { ...fields(), shipper: "x".repeat(501) }]) {
      const res = await post({ si: bad, bl: fields() });
      expect(res.status).toBe(400);
      expect(await error(res)).toBe("si must contain exactly: shipper, consignee, notifyParty, pol, pod, containerCount, grossWeightKg (strings, max 500 chars)");
    }
    expect(save).not.toHaveBeenCalled();
    expect((await post({ si: fields(), bl: { ...fields(), shipper: "x".repeat(500) } })).status).toBe(200);
  });

  it("passes on not-found and conflict messages", async () => {
    for (const status of [404, 409]) {
      save.mockRejectedValueOnce(Object.assign(new Error(`status ${status}`), { status }));
      const res = await post({ si: fields(), bl: fields() });
      expect([res.status, await error(res)]).toEqual([status, `status ${status}`]);
    }
  });

  it("hides other errors behind a generic 502", async () => {
    save.mockRejectedValue(new Error("Firestore 500: secret detail"));
    const res = await post({ si: fields(), bl: fields() });
    expect([res.status, await error(res)]).toEqual([502, "Could not save review. Please try again."]);
  });
});
