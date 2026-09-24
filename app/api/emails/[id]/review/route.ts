import { saveModeratorAction } from "@/lib/firestore";
import { currentModerator } from "@/lib/session";
import { FIELDS, type Edits } from "@/lib/shipments";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => Response.json({ error }, { status });

// Why a document's fields are not acceptable, or "" when they are.
function invalid(side: string, fields: unknown) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return `${side} must be an object`;
  const f = fields as Record<string, unknown>;
  if (Object.keys(f).length !== FIELDS.length || !FIELDS.every((x) => typeof f[x.key] === "string" && (f[x.key] as string).length <= 500)) {
    return `${side} must contain exactly: ${FIELDS.map((x) => x.key).join(", ")} (strings, max 500 chars)`;
  }
  return "";
}

// Body: { si, bl }, the reviewed Shipping Instruction and Draft BL, saved together.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return bad("Invalid email id");
  const moderator = await currentModerator(); // proxy.ts already checked; this is who the review is attributed to
  if (!moderator) return bad("Log in to continue", 401);
  if (moderator.role !== "moderator") return bad("Auditors have read-only access", 403);

  let body: Partial<Edits>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return bad("Body must be JSON");
  }
  const problem = invalid("si", body.si) || invalid("bl", body.bl);
  if (problem) return bad(problem);

  try {
    return Response.json(await saveModeratorAction(moderator.id, id, { si: body.si!, bl: body.bl! }));
  } catch (e) {
    const status = (e as { status?: number }).status;
    return bad(status === 404 || status === 409 ? (e as Error).message : "Could not save review. Please try again.", status === 404 || status === 409 ? status : 502);
  }
}
