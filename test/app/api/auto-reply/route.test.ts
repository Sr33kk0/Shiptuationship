// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, dynamic } from "@/app/api/auto-reply/route";

const email = { id: "email_001", subject: "Hi", sender: "a@example.com", body: "Where is my BL?" };
const post = (body: unknown) => POST(new Request("http://localhost/api/auto-reply", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const read = async (res: Response) => [res.status, await res.json()];
const n8n = vi.fn();

beforeEach(() => {
  n8n.mockReset();
  vi.stubEnv("N8N_AUTO_REPLY_WEBHOOK_URL", "https://n8n.example/webhook/reply");
  vi.stubGlobal("fetch", n8n);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/auto-reply", () => {
  it("is never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("forwards the email to n8n and returns the trimmed reply", async () => {
    n8n.mockResolvedValue(Response.json({ body: "  Dear customer,\nIt ships today.  " }));
    const payload = { email, comparison: { si: {}, bl: {} } };
    expect(await read(await post(payload))).toEqual([200, { body: "Dear customer,\nIt ships today." }]);
    const [url, init] = n8n.mock.calls[0];
    expect(url).toBe("https://n8n.example/webhook/reply");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" });
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects a body that is not JSON", async () => {
    expect(await read(await post("nope"))).toEqual([400, { error: "Body must be JSON" }]);
  });

  it("requires the email id, subject, sender and body as text", async () => {
    for (const bad of [{}, { email: { ...email, id: 1 } }, { email: { ...email, body: undefined } }, null]) {
      expect(await read(await post(bad))).toEqual([400, { error: "Email id, subject, sender, and body are required" }]);
    }
    expect(n8n).not.toHaveBeenCalled();
  });

  it("refuses more than 100,000 characters of email data", async () => {
    expect(await read(await post({ email: { ...email, body: "x".repeat(100_000) } }))).toEqual([413, { error: "Email data is too large" }]);
  });

  it("explains a missing webhook setting", async () => {
    vi.stubEnv("N8N_AUTO_REPLY_WEBHOOK_URL", "");
    expect(await read(await post({ email }))).toEqual([503, { error: "AI Reply is not configured. Set N8N_AUTO_REPLY_WEBHOOK_URL." }]);
  });

  it("returns a generic 502 when n8n fails, errors or replies with nothing", async () => {
    const generic = [502, { error: "Could not generate a reply. Check the n8n workflow and try again." }];
    for (const reply of [
      () => Promise.resolve(Response.json({ body: "hi" }, { status: 500 })),
      () => Promise.resolve(Response.json({ body: "   " })),
      () => Promise.resolve(Response.json({ text: "wrong key" })),
      () => Promise.resolve(new Response("not json")),
      () => Promise.reject(new Error("timeout")),
    ]) {
      n8n.mockImplementationOnce(reply);
      expect(await read(await post({ email }))).toEqual(generic);
    }
    expect(console.error).toHaveBeenCalledTimes(5);
  });
});
