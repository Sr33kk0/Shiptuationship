import { listEmails } from "@/lib/firestore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listEmails());
  } catch (e) {
    console.error("Emails: Firestore read failed", e); // the detail stays in the server logs
    return Response.json({ error: "Could not load emails. Please try again." }, { status: 502 });
  }
}
