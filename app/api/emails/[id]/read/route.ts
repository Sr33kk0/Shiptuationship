import { saveModeratorAction } from "@/lib/firestore";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return Response.json({ error: "Invalid email id" }, { status: 400 });
  try {
    return Response.json(await saveModeratorAction(id));
  } catch (e) {
    const status = (e as { status?: number }).status;
    return Response.json({ error: status === 404 || status === 409 ? (e as Error).message : "Could not mark email as read. Please try again." }, { status: status === 404 || status === 409 ? status : 502 });
  }
}
