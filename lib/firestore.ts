// Server-only: Firestore REST access with a Google OAuth2 refresh token (same model as the n8n credential).
// Never import this from a client component.
import { FIELDS, FIRESTORE_KEYS, type Category, type FieldKey, type Fields, type Shipment, type Side, type Status } from "./shipments";

const PROJECT = process.env.FIRESTORE_PROJECT_ID ?? "hokkien";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ---- OAuth2 ---------------------------------------------------------------

let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env.local");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`OAuth token refresh failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

// ---- REST helpers ---------------------------------------------------------

async function fs(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw Object.assign(new Error(`Firestore ${res.status}: ${await res.text()}`), { status: res.status });
  return res.json();
}

const fsGet = (path: string) => fs(path);

// `paths` is the update mask; pass nested paths ("review.si_fields") to change one key of a map and keep its siblings.
function fsPatch(path: string, fields: Record<string, unknown>, paths = Object.keys(fields)) {
  const mask = paths.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  return fs(`${path}?${mask}`, { method: "PATCH", body: JSON.stringify({ fields: encodeMap(fields) }) });
}

// ---- Firestore value <-> JS -----------------------------------------------

type FsValue = Record<string, unknown>;
type Doc = Record<string, unknown>;

function decode(v: FsValue): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(decode);
  if ("mapValue" in v) return decodeMap((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {});
  return null;
}

const decodeMap = (fields: Record<string, FsValue>): Doc => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));

function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: encodeMap(v as Record<string, unknown>) } };
}

const encodeMap = (obj: Record<string, unknown>) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, encode(v)]));

// ---- Mapping: Firestore doc -> Shipment ------------------------------------

const CATEGORY: Record<string, Category> = {
  "Document-Comparison Request": "document-comparison",
  "New SI Request": "new-si",
  "Invoice Queries": "invoice",
  "General Messages": "general",
};

// ponytail: needs_review / incomplete show as pending; split later if operators need them surfaced.
const STATUS: Record<string, Status> = { flagged: "discrepancy", cleared: "clean" };

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function toFields(map: unknown): Fields | null {
  if (!map || typeof map !== "object") return null;
  const m = map as Doc;
  return Object.fromEntries(FIELDS.map((f) => [f.key, str(m[FIRESTORE_KEYS[f.key]])])) as Fields;
}

const fmtTime = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

export function toShipment(doc: Doc): Shipment {
  const from = str(doc.from);
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const sender = m ? m[2] : from;
  const senderName = m && m[1] ? m[1].replace(/^"|"$/g, "") : sender;

  const received = str(doc.received_at);
  const ts = Date.parse(received);
  const rawDate = Number.isNaN(ts) ? received : new Date(ts).toISOString().slice(0, 10);
  const date = Number.isNaN(ts) ? received : new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const review = doc.review as Doc | undefined;
  const comparison = (doc.comparison as Doc | undefined) ?? {};
  const cmpFields = (comparison.fields as Record<string, Doc> | undefined) ?? {};
  const byFsKey = Object.fromEntries(FIELDS.map((f) => [FIRESTORE_KEYS[f.key], f])) as Record<string, (typeof FIELDS)[number]>;

  const discrepancies = ((comparison.discrepancies as string[] | undefined) ?? [])
    .filter((name) => byFsKey[name])
    .map((name) => {
      const f = byFsKey[name];
      const c = cmpFields[name] ?? {};
      return { field: f.key as FieldKey, label: f.label, si: str(c.si), bl: str(c.bl), note: str(c.severity) };
    });

  const attachments = (doc.attachments as string[] | undefined) ?? [];
  const status = STATUS[str(doc.status)] ?? "pending";

  const trail: { at: string; action: string }[] = [];
  if (doc.classified_at) trail.push({ at: str(doc.classified_at), action: `Classified as ${str(doc.classification)}` });
  if (comparison.performed_at) trail.push({ at: str(comparison.performed_at), action: `Auto-comparison: ${str(comparison.status)}` });
  if (review?.reviewed_at) {
    const edited = review.edited_side ? `${str(review.edited_side).toUpperCase()} edited, ` : "";
    trail.push({ at: str(review.reviewed_at), action: `Manual verification saved (${edited}${status === "clean" ? "all matched & cleared" : "override flagged"})` });
  }
  trail.sort((a, b) => a.at.localeCompare(b.at));

  return {
    id: str(doc.email_id),
    subject: str(doc.subject),
    sender,
    senderName,
    category: CATEGORY[str(doc.classification)] ?? "other",
    date,
    rawDate,
    status,
    attachmentCount: attachments.length,
    attachmentNames: attachments,
    emailBody: str(doc.body),
    siRef: str((doc.si_source as Doc | undefined)?.filename) || undefined,
    blRef: str((doc.bl_source as Doc | undefined)?.filename) || undefined,
    extractedFields: toFields(review?.fields) ?? toFields(doc.bl),
    referenceFields: toFields(review?.si_fields) ?? toFields(doc.si),
    discrepancies,
    auditTrail: trail.map((t) => ({ time: fmtTime(t.at), action: t.action })),
  };
}

// ---- Public API -------------------------------------------------------------

export async function listEmails(): Promise<Shipment[]> {
  // ponytail: single page; add a nextPageToken loop past 300 emails.
  const data = (await fsGet("emails?pageSize=300")) as { documents?: { fields?: Record<string, FsValue> }[] };
  return (data.documents ?? []).map((d) => toShipment(decodeMap(d.fields ?? {})));
}

export async function getEmail(id: string): Promise<Shipment | null> {
  try {
    const d = (await fsGet(`emails/${encodeURIComponent(id)}`)) as { fields?: Record<string, FsValue> };
    return toShipment(decodeMap(d.fields ?? {}));
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

// Edits never touch the `si` / `bl` maps the n8n workflow writes; they are stored as overrides under `review`.
// `review.fields` is the BL override (the name predates SI editing, so existing reviews keep working);
// `review.si_fields` is the SI override.
export async function saveReview(id: string, side: Side, fields: Fields, flagged: boolean): Promise<Shipment> {
  const key = side === "si" ? "si_fields" : "fields";
  await fsPatch(
    `emails/${encodeURIComponent(id)}`,
    {
      review: { reviewed_at: new Date(), edited_side: side, [key]: Object.fromEntries(FIELDS.map((f) => [FIRESTORE_KEYS[f.key], fields[f.key]])) },
      status: flagged ? "flagged" : "cleared",
      human_review_required: flagged,
    },
    ["review.reviewed_at", "review.edited_side", `review.${key}`, "status", "human_review_required"],
  );
  return (await getEmail(id))!;
}
