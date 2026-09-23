import { saveModeratorAction } from "@/lib/firestore";
import { currentModerator } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return Response.json({ error: "Invalid email id" }, { status: 400 });
  const moderator = await currentModerator(); // proxy.ts already checked; this is who the action is attributed to
  if (!moderator) return Response.json({ error: "Log in to continue" }, { status: 401 });
  try {
    return Response.json(await saveModeratorAction(moderator.id, id));
  } catch (e) {
    const status = (e as { status?: number }).status;
    return Response.json({ error: status === 404 || status === 409 ? (e as Error).message : "Could not mark email as read. Please try again." }, { status: status === 404 || status === 409 ? status : 502 });
  }
}
