import { listEmails } from "@/lib/firestore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listEmails());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
