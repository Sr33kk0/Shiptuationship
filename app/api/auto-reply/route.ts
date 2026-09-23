export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return bad("Body must be JSON");
  }

  const body = payload as { email?: { id?: unknown; subject?: unknown; sender?: unknown; body?: unknown } };
  if (!body?.email ||![body.email.id, body.email.subject, body.email.sender, body.email.body].every((value) => typeof value === "string")) {
    return bad("Email id, subject, sender, and body are required");
  }
  if (JSON.stringify(payload).length > 100_000) return bad("Email data is too large", 413);

  const webhook = process.env.N8N_AUTO_REPLY_WEBHOOK_URL;
  if (!webhook) return bad("AI Reply is not configured. Set N8N_AUTO_REPLY_WEBHOOK_URL.", 503);

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`n8n returned ${response.status}`);
    if (!result || typeof result.body !== "string" || !result.body.trim()) throw new Error("n8n returned an empty reply");
    return Response.json({ body: result.body.trim() });
  } catch (error) {
    console.error("AI Reply webhook failed", error);
    return bad("Could not generate a reply. Check the n8n workflow and try again.", 502);
  }
}
