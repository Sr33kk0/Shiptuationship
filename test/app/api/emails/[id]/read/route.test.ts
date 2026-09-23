// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveModeratorAction } from "@/lib/firestore";
import { currentModerator } from "@/lib/session";
import { POST } from "@/app/api/emails/[id]/read/route";

vi.mock("@/lib/firestore", () => ({ saveModeratorAction: vi.fn() }));
vi.mock("@/lib/session", () => ({ currentModerator: vi.fn() }));
const save = vi.mocked(saveModeratorAction);
const post = (id: string) => POST(new Request(`http://localhost/api/emails/${id}/read`, { method: "POST" }), { params: Promise.resolve({ id }) });
const fail = (message: string, status?: number) => Object.assign(new Error(message), { status });

beforeEach(() => {
  save.mockReset();
  vi.mocked(currentModerator).mockResolvedValue({ id: "DanielHo", name: "Daniel Ho", role: "moderator" });
});

describe("POST /api/emails/[id]/read", () => {
  it("rejects an id that is not a plain document id", async () => {
    for (const id of ["", "../x", "a b", "a/b"]) {
      const res = await post(id);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid email id" });
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("marks the email as read and returns it", async () => {
    save.mockResolvedValue({ id: "email_001", isRead: true } as never);
    const res = await post("email_001");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "email_001", isRead: true });
    expect(save).toHaveBeenCalledWith("DanielHo", "email_001");
  });

  it("refuses an auditor, who is read-only", async () => {
    vi.mocked(currentModerator).mockResolvedValue({ id: "AuditAnn", name: "Audit Ann", role: "auditor" });
    const res = await post("email_001");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Auditors have read-only access" });
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses without a valid session", async () => {
    vi.mocked(currentModerator).mockResolvedValue(null);
    const res = await post("email_001");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Log in to continue" });
    expect(save).not.toHaveBeenCalled();
  });

  it("passes on not-found and conflict messages", async () => {
    for (const status of [404, 409]) {
      save.mockRejectedValueOnce(fail(`status ${status}`, status));
      const res = await post("email_001");
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error: `status ${status}` });
    }
  });

  it("hides other errors behind a generic 502", async () => {
    save.mockRejectedValue(fail("Firestore 500: secret detail", 500));
    const res = await post("email_001");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Could not mark email as read. Please try again." });
  });
});
