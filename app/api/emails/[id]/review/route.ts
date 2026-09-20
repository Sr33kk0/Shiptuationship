import { saveModeratorAction } from "@/lib/firestore";
import { FIELDS, type Fields, type Side } from "@/lib/shipments";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return bad("Invalid email id");

  let fields: Fields;
  let side: Side;
  try {
    ({ fields, side = "bl" } = await req.json()); // side defaults to BL, the only option before SI editing existed
  } catch {
    return bad("Body must be JSON");
  }
  if (side !== "si" && side !== "bl") return bad('side must be "si" or "bl"');
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return bad("fields must be an object");
  const keys = Object.keys(fields);
  if (keys.length !== FIELDS.length || !FIELDS.every((f) => typeof fields[f.key] === "string" && fields[f.key].length <= 500)) {
    return bad(`fields must contain exactly: ${FIELDS.map((f) => f.key).join(", ")} (strings, max 500 chars)`);
  }

  try {
    return Response.json(await saveModeratorAction(id, fields, side));
  } catch (e) {
    const status = (e as { status?: number }).status;
    return bad(status === 404 || status === 409 ? (e as Error).message : "Could not save review. Please try again.", status === 404 || status === 409 ? status : 502);
  }
}
