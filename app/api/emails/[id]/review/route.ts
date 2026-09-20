import { getEmail, saveReview } from "@/lib/firestore";
import { FIELDS, mismatches, type Fields, type Side } from "@/lib/shipments";

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
    const current = await getEmail(id);
    if (!current) return bad("Email not found", 404);
    if (!current.referenceFields || !current.extractedFields) return bad("Shipping Instruction and Draft BL must both be extracted before editing", 409);
    const other = side === "si" ? current.extractedFields : current.referenceFields; // the side that is not being edited
    const flagged = mismatches(fields, other).length > 0;
    return Response.json(await saveReview(id, side, fields, flagged));
  } catch (e) {
    return bad((e as Error).message, 502);
  }
}
