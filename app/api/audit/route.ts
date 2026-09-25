import { listAuditLog } from "@/lib/firestore";

export const dynamic = "force-dynamic";

// /api/audit?source=user (moderator actions) or ?source=system (n8n workflow)
// /api/audit?email=<id>: both logs for that one email, newest first (the Audit Log pane of the email popup)
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const source = params.get("source");
  const email = params.get("email");
  try {
    if (email) {
      const logs = await Promise.all([listAuditLog("user", email), listAuditLog("system", email)]);
      return Response.json(logs.flat().sort((a, b) => b.at.localeCompare(a.at)));
    }
    if (source !== "user" && source !== "system") return Response.json({ error: "source must be user or system" }, { status: 400 });
    return Response.json(await listAuditLog(source));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
