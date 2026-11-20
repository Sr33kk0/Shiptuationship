import { listAuditLog } from "@/lib/firestore";

export const dynamic = "force-dynamic";

// /api/audit?source=user (moderator actions) or ?source=system (n8n workflow)
// /api/audit?email=<id>: both logs for that one email, newest first (the Audit Log pane of the email popup)
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const source = params.get("source");
  const email = params.get("email");
  if (email !== null && !/^[a-zA-Z0-9_-]+$/.test(email)) return Response.json({ error: "Invalid email id" }, { status: 400 });
  try {
    if (email) {
      const logs = await Promise.all([listAuditLog("user", email), listAuditLog("system", email)]);
      return Response.json(logs.flat().sort((a, b) => b.at.localeCompare(a.at)));
    }
    if (source !== "user" && source !== "system") return Response.json({ error: "source must be user or system" }, { status: 400 });
    return Response.json(await listAuditLog(source));
  } catch (e) {
    console.error("Audit log: Firestore read failed", e); // the detail stays in the server logs
    return Response.json({ error: "Could not load audit log. Please try again." }, { status: 502 });
  }
}
