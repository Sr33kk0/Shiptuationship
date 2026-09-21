import { listAuditLog } from "@/lib/firestore";

export const dynamic = "force-dynamic";

// /api/audit?source=user (moderator actions) or ?source=system (n8n workflow)
export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get("source");
  if (source !== "user" && source !== "system") return Response.json({ error: "source must be user or system" }, { status: 400 });
  try {
    return Response.json(await listAuditLog(source));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
