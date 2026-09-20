// Server-only: Firestore REST access with a Google OAuth2 refresh token (same model as the n8n credential).
// Never import this from a client component.
import type { AuditEvent } from "./audit";
import { FIELDS, FIRESTORE_KEYS, mismatches, type Category, type FieldKey, type Fields, type Shipment, type Side, type Status } from "./shipments";

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
  const res = await fetch(`${BASE}${path.startsWith(":") ? "" : "/"}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw Object.assign(new Error(`Firestore ${res.status}: ${await res.text()}`), { status: res.status });
  return res.json();
}

const fsGet = (path: string) => fs(path);

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

  // An email's date is when n8n classified it (`classified_at`, a Firestore timestamp). `received_at` is kept only as a fallback:
  // it is an empty string on every document today.
  const stamped = str(doc.classified_at) || str(doc.received_at);
  const ts = Date.parse(stamped);
  const when = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const at = Number.isNaN(ts) ? "" : when.toISOString(); // full timestamp, for sorting by time within a day
  // `rawDate` (the filter key) and `date` (the label) are built from the same local calendar day, so the date filter always agrees with the table.
  const rawDate = Number.isNaN(ts) ? stamped : `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const date = Number.isNaN(ts) ? stamped : when.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const review = doc.review as Doc | undefined;
  const read = doc.read_status as Doc | undefined;
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
    trail.push({ at: str(review.reviewed_at), action: `Manual verification saved by ${str(review.reviewed_by) || "unknown reviewer"} (${edited}${status === "clean" ? "all matched & cleared" : "override flagged"})` });
  }
  if (read?.marked_at) trail.push({ at: str(read.marked_at), action: `Marked as read by ${str(read.marked_by) || "unknown reviewer"}` });
  trail.sort((a, b) => a.at.localeCompare(b.at));

  return {
    id: str(doc.email_id),
    subject: str(doc.subject),
    sender,
    senderName,
    category: CATEGORY[str(doc.classification)] ?? "other",
    date,
    rawDate,
    at,
    status,
    reviewedBy: str(review?.reviewed_by),
    reviewedAt: str(review?.reviewed_at),
    isRead: read?.is_read === true,
    markedReadBy: str(read?.marked_by),
    markedReadAt: str(read?.marked_at),
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

async function listEmailDocs(): Promise<Doc[]> {
  // ponytail: single page; add a nextPageToken loop past 300 emails.
  const data = (await fsGet("emails?pageSize=300")) as { documents?: { fields?: Record<string, FsValue> }[] };
  return (data.documents ?? []).map((d) => decodeMap(d.fields ?? {}));
}

export async function listEmails(): Promise<Shipment[]> {
  return (await listEmailDocs()).map(toShipment);
}

// The two audit logs, read-only and newest first:
//  "system": what the n8n workflow recorded on each email (classified / auto-compared), taken from the email documents;
//  "user":   every moderator action, which saveModeratorAction writes to `emails/{id}/activity`.
export async function listAuditLog(source: "user" | "system"): Promise<AuditEvent[]> {
  const emails = await listEmailDocs();
  const events: AuditEvent[] = [];

  if (source === "system") {
    for (const e of emails) {
      const emailId = str(e.email_id);
      const base = { emailId, subject: str(e.subject), actor: "n8n Workflow", bot: true, outcome: "", changes: [] };
      if (e.classified_at) events.push({ ...base, id: `${emailId}:classified`, at: str(e.classified_at), kind: "classified", detail: str(e.classification) });
      const cmp = e.comparison as Doc | undefined;
      if (cmp?.performed_at) events.push({ ...base, id: `${emailId}:compared`, at: str(cmp.performed_at), kind: "compared", detail: str(cmp.status) });
    }
    return events.sort((a, b) => b.at.localeCompare(a.at));
  }

  const [names, rows] = await Promise.all([
    fsGet("moderators?pageSize=100").then((d: { documents?: { name: string; fields?: Record<string, FsValue> }[] }) =>
      Object.fromEntries((d.documents ?? []).map((m) => [m.name.split("/").pop()!, str(decodeMap(m.fields ?? {}).display_name)]))),
    // ponytail: one page of 500 activity docs, no server-side order (a collection-group order needs an index); sorted below.
    fs(":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "activity", allDescendants: true }], limit: 500 } }) }) as Promise<{ document?: { name: string; fields?: Record<string, FsValue> } }[]>,
  ]);
  const subject = new Map(emails.map((e) => [str(e.email_id), str(e.subject)]));
  const label = Object.fromEntries(FIELDS.map((f) => [FIRESTORE_KEYS[f.key], f.label]));
  for (const r of rows) {
    if (!r.document) continue;
    const [, rawId, docId] = r.document.name.match(/\/emails\/([^/]+)\/activity\/([^/]+)$/) ?? [];
    if (!rawId) continue;
    const emailId = decodeURIComponent(rawId);
    const a = decodeMap(r.document.fields ?? {});
    const moderator = str(a.moderator_id);
    const review = a.action === "review_saved";
    events.push({
      id: `${emailId}:${docId}`,
      at: str(a.occurred_at),
      kind: review ? "review_saved" : "marked_read",
      actor: names[moderator] || moderator || "Unknown",
      bot: false,
      emailId,
      subject: subject.get(emailId) ?? "",
      detail: str(a.edited_side).toUpperCase(),
      outcome: review ? ((a.after as Doc | undefined)?.status === "flagged" ? "flagged" : "cleared") : "",
      changes: Object.entries((a.changes as Record<string, Doc> | undefined) ?? {}).map(([k, c]) => ({ field: label[k] ?? k, before: str(c.before), after: str(c.after) })),
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

// Preset demo identity: everyone using this app acts as DanielHo.
const MODERATOR = "DanielHo";
const requestTime = (fieldPath: string) => ({ fieldPath, setToServerValue: "REQUEST_TIME" });
const actionError = (message: string, status: number) => Object.assign(new Error(message), { status });

// Edits never touch the `si` / `bl` maps the n8n workflow writes; they are stored as overrides under `review`.
// `review.fields` is the BL override (the name predates SI editing, so existing reviews keep working);
// `review.si_fields` is the SI override. Without `fields` the call marks the email as read instead.
export async function saveModeratorAction(id: string, fields?: Fields, side: Side = "bl"): Promise<Shipment> {
  const path = `emails/${encodeURIComponent(id)}`;
  let snapshot: { name: string; fields?: Record<string, FsValue>; updateTime: string };
  try {
    snapshot = await fsGet(path);
  } catch (e) {
    if ((e as { status?: number }).status === 404) throw actionError("Email not found", 404);
    throw e;
  }
  const before = decodeMap(snapshot.fields ?? {});
  const current = toShipment(before);
  if (!fields && current.isRead) return current;
  if (fields && (current.category !== "document-comparison" || !current.referenceFields || !current.extractedFields)) {
    throw actionError("Shipping Instruction and Draft BL must both be extracted before editing", 409);
  }
  const saved = side === "si" ? current.referenceFields : current.extractedFields; // the side being edited
  const other = side === "si" ? current.extractedFields : current.referenceFields; // the side it is compared against
  const flagged = fields ? mismatches(fields, other!).length > 0 : false;
  const reviewKey = side === "si" ? "si_fields" : "fields";
  const updates: Doc = fields ? {
    review: { reviewed_by: MODERATOR, edited_side: side, [reviewKey]: Object.fromEntries(FIELDS.map((f) => [FIRESTORE_KEYS[f.key], fields[f.key]])) },
    status: flagged ? "flagged" : "cleared",
    human_review_required: flagged,
  } : { read_status: { is_read: true, marked_by: MODERATOR } };
  // Nested paths for `review`, so saving one side keeps the other side's override.
  const mask = fields ? ["review.reviewed_by", "review.edited_side", `review.${reviewKey}`, "status", "human_review_required"] : Object.keys(updates);
  const timeField = fields ? "review.reviewed_at" : "read_status.marked_at";
  const changes: Doc = fields ? Object.fromEntries(FIELDS
    .filter((f) => saved?.[f.key] !== fields[f.key])
    .map((f) => [FIRESTORE_KEYS[f.key], { before: saved?.[f.key] ?? null, after: fields[f.key] }])) : {};
  const writes: unknown[] = [];
  const moderatorName = `${BASE.slice("https://firestore.googleapis.com/v1/".length)}/moderators/${MODERATOR}`;
  try {
    await fsGet(`moderators/${MODERATOR}`);
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    writes.push({
      update: { name: moderatorName, fields: encodeMap({ display_name: "Daniel Ho", role: "moderator" }) },
      currentDocument: { exists: false },
      updateTransforms: [requestTime("created_at")],
    });
  }
  writes.push({
    update: { name: snapshot.name, fields: encodeMap(updates) },
    updateMask: { fieldPaths: mask },
    currentDocument: { updateTime: snapshot.updateTime },
    updateTransforms: [requestTime(timeField)],
  }, {
    update: { name: `${snapshot.name}/activity/${crypto.randomUUID()}`, fields: encodeMap({
      moderator_id: MODERATOR,
      action: fields ? "review_saved" : "marked_read",
      edited_side: fields ? side : null,
      changes,
      before: fields ? { review: before.review ?? null, status: before.status ?? null, human_review_required: before.human_review_required ?? null } : { read_status: before.read_status ?? null },
      after: updates,
    }) },
    currentDocument: { exists: false },
    updateTransforms: [requestTime("occurred_at")],
  });
  try {
    const result = await fs(":commit", { method: "POST", body: JSON.stringify({ writes }) });
    const map = updates[fields ? "review" : "read_status"] as Doc;
    map[fields ? "reviewed_at" : "marked_at"] = result.writeResults[writes.length - 2].transformResults[0].timestampValue;
    // Mirror the nested mask: the untouched side's override under `review` survives the save.
    const review = fields ? { ...((before.review as Doc | undefined) ?? {}), ...(updates.review as Doc) } : before.review;
    return toShipment({ ...before, ...updates, review });
  } catch (e) {
    if ((e as { status?: number }).status === 409 || ((e as Error).message.includes("FAILED_PRECONDITION"))) {
      throw actionError("The record changed while saving. Refresh and try again.", 409);
    }
    throw e;
  }
}
