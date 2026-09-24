// Server-only: Firestore REST access with a Google OAuth2 refresh token (same model as the n8n credential).
// Never import this from a client component.
import type { AuditEvent, ComparedField } from "./audit";
import type { Role } from "./session";
import { FIELDS, FIRESTORE_KEYS, mismatches, parseVoyage, type Category, type Edits, type FieldKey, type Fields, type Shipment, type Status } from "./shipments";

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
  "Spam": "spam",
};

const STATUS: Record<string, Status> = { flagged: "discrepancy", needs_review: "discrepancy", incomplete: "discrepancy", cleared: "clean" };

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// Also explains older records that predate persisted review reasons.
function ingestionReasons(doc: Doc): string[] {
  const reasons: string[] = [];
  if (doc.missing_attachments_warning) reasons.push(str(doc.missing_attachments_warning));
  if (doc.classification_error) reasons.push(`Email classification failed: ${str(doc.classification_error)}`);
  const error = doc.last_ingestion_error as Doc | undefined;
  if (error) reasons.push(`Attachment ${str(error.filename) || '(unknown file)'} could not be processed: ${str(error.message) || 'No readable document data.'}`);
  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  // Ingestion owns attachment-claim detection; banners and quoted history are not claims.
  if (!attachments.length && !doc.missing_attachments_warning &&
      doc.classification === 'Document-Comparison Request') {
    reasons.push('No attachments were provided. Request the missing documents from the sender.');
  }
  return reasons;
}

function toFields(map: unknown): Fields | null {
  if (!map || typeof map !== "object") return null;
  const m = map as Doc;
  return Object.fromEntries(FIELDS.map((f) => [f.key, str(m[FIRESTORE_KEYS[f.key]])])) as Fields;
}

// "si+bl" (how a review records which documents it changed) → "SI & BL"
const sidesLabel = (v: unknown) => str(v).toUpperCase().replace("+", " & ");

// The Google Drive link of a source map (`si_source` / `bl_source`); "" when it has none.
function driveLink(src: Doc | undefined): string {
  const id = str(src?.drive_file_id);
  const link = str(src?.drive_link) || (id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : "");
  return link.startsWith("https://drive.google.com/") ? link : "";
}

// What the auto-comparison saw on one email: the source documents, anything that blocked it, and each field on each document
// from the value read off the document (before the port check rewrote it) to the value it compared.
function comparisonDetail(doc: Doc): Pick<AuditEvent, "facts" | "fields"> {
  const facts = (["si", "bl"] as const).map((side) => {
    const src = doc[`${side}_source`] as Doc | undefined;
    return { label: `${side.toUpperCase()} document`, value: str(src?.filename) || (doc[side] ? "Unnamed file" : "Not extracted"), href: driveLink(src) || undefined };
  });
  facts.push(...ingestionReasons(doc).map((value) => ({ label: "Blocked", value, href: undefined })));
  const compared = ((doc.comparison as Doc | undefined)?.fields as Record<string, Doc> | undefined) ?? {};
  const fields = FIELDS.flatMap((f): ComparedField[] => {
    const key = FIRESTORE_KEYS[f.key];
    const c = compared[key];
    if (!c) return [];
    const side = (s: "si" | "bl") => {
      const port = key.startsWith("port_of_") ? (doc[`${s}_port_validation`] as Record<string, Doc> | undefined)?.[key] : undefined;
      const checked = port?.status === "valid" || port?.status === "added";
      return {
        document: str(port ? port.original : (doc[s] as Doc | undefined)?.[key]),
        // a checked port is compared as the name the port check gave it; anything else as Compare Fields normalised it
        normalized: checked ? str(port.normalized) : str(c[`${s}_normalized`]),
        note: !key.startsWith("port_of_") ? "" : checked ? `UN/LOCODE ${str(port.code)} ${port.status === "added" ? "added" : "confirmed"}` : str(port?.reason) || "Port was not validated.",
        ok: !key.startsWith("port_of_") || checked,
      };
    };
    const result = c.match !== true ? "mismatch" : c.discrepancy_type === "formatting" ? "formatting" : "match";
    return [{ field: f.label, result, si: side("si"), bl: side("bl") }];
  });
  return { facts, fields };
}

const fmtTime = (iso: unknown) =>(iso ? new Date(String(iso)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

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
  // n8n stores a Drive link on each of the two source maps it extracts from (`si_source`, `bl_source`); other attachments have only a name.
  const attachmentLinks: Record<string, string> = {};
  for (const src of [doc.si_source, doc.bl_source] as (Doc | undefined)[]) {
    const link = driveLink(src);
    if (str(src?.filename) && link) attachmentLinks[str(src?.filename)] = link;
  }
  const blockers = ingestionReasons(doc);
  const status = blockers.length || doc.human_review_required === true ? "discrepancy" : STATUS[str(doc.status)] ?? "pending";
  const reviewReasons = status === "discrepancy" ? [...new Set([
    ...(Array.isArray(doc.human_review_reasons) ? doc.human_review_reasons.filter((r): r is string => typeof r === 'string' && !!r.trim()) : []),
    ...blockers,
  ])] : [];
  if (status === 'discrepancy' && !reviewReasons.length) {
    if (doc.classification === 'Document-Comparison Request') {
      for (const [key, label] of [['bl', 'Bill of Lading'], ['si', 'Shipping Instruction']] as const) {
        if (!doc[key]) reviewReasons.push(`${label} is missing or could not be extracted. Supply a readable document and reprocess the email.`);
      }
    }
    for (const d of discrepancies) reviewReasons.push(`${d.label}: SI ${d.si || '(missing)'}; BL ${d.bl || '(missing)'}. Verify the difference or missing value.`);
    if (!reviewReasons.length) reviewReasons.push('This record was flagged for human review without a recorded reason. Inspect the source email and processing history.');
  }

  const trail: { at: string; action: string }[] = [];
  if (doc.classified_at) trail.push({ at: str(doc.classified_at), action: `Classified as ${str(doc.classification)}` });
  if (comparison.performed_at) trail.push({ at: str(comparison.performed_at), action: `Auto-comparison: ${str(comparison.status)}` });
  if (reviewReasons.length) trail.push({ at: str((doc.last_ingestion_error as Doc | undefined)?.occurred_at ?? comparison.performed_at ?? doc.classified_at), action: `Human review required: ${reviewReasons.join(' ')}` });
  if (review?.reviewed_at) {
    const who = str(review.reviewed_by) || "unknown reviewer";
    const edited = review.edited_side ? `${sidesLabel(review.edited_side)} edited, ` : "";
    trail.push({ at: str(review.reviewed_at), action: doc.classification === "Document-Comparison Request" ? `Manual verification saved by ${who} (${edited}${status === "clean" ? "all matched & cleared" : "override flagged"})` : `Cleared by ${who}` });
  }
  if (read?.marked_at) trail.push({ at: str(read.marked_at), action: `Marked as read by ${str(read.marked_by) || "unknown reviewer"}` });
  trail.sort((a, b) => a.at.localeCompare(b.at));

  return {
    id: str(doc.email_id),
    subject: str(doc.subject),
    sender,
    senderName,
    category: CATEGORY[str(doc.classification)] ?? "spam",
    date,
    rawDate,
    at,
    status,
    reviewReasons,
    reviewedBy: str(review?.reviewed_by),
    reviewedAt: str(review?.reviewed_at),
    isRead: read?.is_read === true,
    markedReadBy: str(read?.marked_by),
    markedReadAt: str(read?.marked_at),
    attachmentCount: attachments.length,
    attachmentNames: attachments,
    attachmentLinks,
    emailBody: str(doc.body),
    ...parseVoyage(str(doc.subject), str(doc.body)),
    siRef: str((doc.si_source as Doc | undefined)?.filename) || undefined,
    blRef: str((doc.bl_source as Doc | undefined)?.filename) || undefined,
    extractedFields: toFields(review?.fields) ?? toFields(doc.bl),
    referenceFields: toFields(review?.si_fields) ?? toFields(doc.si),
    originalExtractedFields: toFields(doc.bl),
    originalReferenceFields: toFields(doc.si),
    discrepancies,
    auditTrail: trail.map((t) => ({ time: fmtTime(t.at), action: t.action })),
  };
}

// ---- Public API -------------------------------------------------------------

type FsDocument = { name: string; fields?: Record<string, FsValue> };

async function listDocuments(collection: string): Promise<FsDocument[]> {
  const documents: FsDocument[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300" });
    if (pageToken) query.set("pageToken", pageToken);
    const page = (await fsGet(`${collection}?${query}`)) as { documents?: FsDocument[]; nextPageToken?: string };
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

async function listEmailDocs(): Promise<Doc[]> {
  return (await listDocuments("emails")).map((d) => decodeMap(d.fields ?? {}));
}

async function listActivityDocs(): Promise<FsDocument[]> {
  // ponytail: offset batches avoid a new Firestore index; use an ordered cursor if skipped-read cost becomes material.
  const documents: FsDocument[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await fs(":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: "activity", allDescendants: true }], limit: 500, ...(offset && { offset }),
    } }) }) as { document?: FsDocument }[];
    const page = rows.flatMap((row) => row.document ? [row.document] : []);
    documents.push(...page);
    if (page.length < 500) return documents;
  }
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
      if (e.classified_at) events.push({ ...base, id: `${emailId}:classified`, at: str(e.classified_at), kind: "classified", detail: str(e.classification), facts: [
        { label: "From", value: str(e.from) },
        { label: "Attachments", value: ((e.attachments as string[] | undefined) ?? []).join(", ") || "None" },
        ...(e.classification_error ? [{ label: "Classifier error", value: str(e.classification_error) }] : []),
      ] });
      const cmp = e.comparison as Doc | undefined;
      if (cmp?.performed_at) events.push({ ...base, id: `${emailId}:compared`, at: str(cmp.performed_at), kind: "compared", detail: str(cmp.status), ...comparisonDetail(e) });
    }
    return events.sort((a, b) => b.at.localeCompare(a.at));
  }

  const [names, rows] = await Promise.all([
    listDocuments("moderators").then((documents) =>
      Object.fromEntries(documents.map((m) => [m.name.split("/").pop()!, str(decodeMap(m.fields ?? {}).display_name)]))),
    listActivityDocs(),
  ]);
  const subject = new Map(emails.map((e) => [str(e.email_id), str(e.subject)]));
  const label = Object.fromEntries(FIELDS.map((f) => [FIRESTORE_KEYS[f.key], f.label]));
  for (const document of rows) {
    const [, rawId, docId] = document.name.match(/\/emails\/([^/]+)\/activity\/([^/]+)$/) ?? [];
    if (!rawId) continue;
    const emailId = decodeURIComponent(rawId);
    const a = decodeMap(document.fields ?? {});
    const moderator = str(a.moderator_id);
    const review = a.action === "review_saved";
    events.push({
      id: `${emailId}:${docId}`,
      at: str(a.occurred_at),
      kind: review ? "review_saved" : a.action === "cleared" ? "cleared" : "marked_read",
      actor: names[moderator] || moderator || "Unknown",
      bot: false,
      emailId,
      subject: subject.get(emailId) ?? "",
      detail: sidesLabel(a.edited_side),
      outcome: review ? ((a.after as Doc | undefined)?.status === "cleared" ? "cleared" : "flagged") : "",
      // `changes` is { si: { field: {before, after} }, bl: {...} }; reviews saved before SI and BL were saved together have one flat side
      changes: Object.entries((a.changes as Record<string, Doc> | undefined) ?? {}).flatMap(([k, c]) =>
        "after" in c ? [{ field: label[k] ?? k, before: str(c.before), after: str(c.after) }]
          : Object.entries(c as Record<string, Doc>).map(([f, d]) => ({ field: `${k.toUpperCase()} ${label[f] ?? f}`, before: str(d.before), after: str(d.after) }))),
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

// The moderator (or auditor) with this username, for logging in; null when there is none. Usernames are stored lowercase.
// Only `role: "moderator"` may make changes; a missing or any other role logs in read-only, as an auditor.
export async function findModerator(username: string): Promise<{ id: string; name: string; role: Role; passwordHash: string } | null> {
  const [row] = await fs(":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "moderators" }],
    where: { fieldFilter: { field: { fieldPath: "username" }, op: "EQUAL", value: { stringValue: username } } },
    limit: 1,
  } }) }) as { document?: FsDocument }[];
  if (!row?.document) return null;
  const m = decodeMap(row.document.fields ?? {});
  const id = row.document.name.split("/").pop()!;
  return { id, name: str(m.display_name) || id, role: m.role === "moderator" ? "moderator" : "auditor", passwordHash: str(m.password_hash) };
}

const requestTime = (fieldPath: string) => ({ fieldPath, setToServerValue: "REQUEST_TIME" });
const actionError = (message: string, status: number) => Object.assign(new Error(message), { status });

type Snapshot = { name: string; fields?: Record<string, FsValue>; updateTime: string };

async function loadEmail(id: string): Promise<{ snapshot: Snapshot; before: Doc }> {
  try {
    const snapshot: Snapshot = await fsGet(`emails/${encodeURIComponent(id)}`);
    return { snapshot, before: decodeMap(snapshot.fields ?? {}) };
  } catch (e) {
    if ((e as { status?: number }).status === 404) throw actionError("Email not found", 404);
    throw e;
  }
}

// One commit: the masked update (stamped with the server time at `timeField`) and its activity record. Returns that time.
async function commitAction(snapshot: Snapshot, updates: Doc, mask: string[], timeField: string, activity: Doc): Promise<string> {
  const writes = [{
    update: { name: snapshot.name, fields: encodeMap(updates) },
    updateMask: { fieldPaths: mask },
    currentDocument: { updateTime: snapshot.updateTime },
    updateTransforms: [requestTime(timeField)],
  }, {
    update: { name: `${snapshot.name}/activity/${crypto.randomUUID()}`, fields: encodeMap({ ...activity, after: updates }) },
    currentDocument: { exists: false },
    updateTransforms: [requestTime("occurred_at")],
  }];
  try {
    const result = await fs(":commit", { method: "POST", body: JSON.stringify({ writes }) });
    return result.writeResults[0].transformResults[0].timestampValue;
  } catch (e) {
    if ((e as { status?: number }).status === 409 || ((e as Error).message.includes("FAILED_PRECONDITION"))) {
      throw actionError("The record changed while saving. Refresh and try again.", 409);
    }
    throw e;
  }
}

// Edits never touch the `si` / `bl` maps the n8n workflow writes (they stay the originals); they are stored as overrides under `review`.
// `review.fields` is the BL override (the name predates SI editing, so existing reviews keep working); `review.si_fields` is the SI override.
// A review saves both documents together. Without `edits` the call marks the email as read instead.
// `moderator` is the logged-in moderator's document id, which the action is attributed to.
export async function saveModeratorAction(moderator: string, id: string, edits?: Edits): Promise<Shipment> {
  const { snapshot, before } = await loadEmail(id);
  const current = toShipment(before);
  if (!edits && current.isRead) return current;
  if (edits && (current.category !== "document-comparison" || !current.referenceFields || !current.extractedFields)) {
    throw actionError("Shipping Instruction and Draft BL must both be extracted before editing", 409);
  }
  const saved = { si: current.referenceFields!, bl: current.extractedFields! };
  const different = edits ? mismatches(edits.si, edits.bl) : [];
  const blockers = ingestionReasons(before);
  const reviewReasons = edits ? [...blockers, ...different.map(key => `${FIELDS.find(f => f.key === key)!.label} differs between SI and BL after manual verification.`)] : [];
  const flagged = reviewReasons.length > 0;
  // What changed on each document, e.g. { bl: { container_count: { before: "4", after: "3" } } }; a document with no changes is left out.
  const changes: Doc = edits ? Object.fromEntries((["si", "bl"] as const).flatMap((side) => {
    const changed = FIELDS.filter((f) => saved[side][f.key] !== edits[side][f.key]);
    return changed.length ? [[side, Object.fromEntries(changed.map((f) => [FIRESTORE_KEYS[f.key], { before: saved[side][f.key], after: edits[side][f.key] }]))]] : [];
  })) : {};
  const editedSide = Object.keys(changes).join("+"); // "si", "bl", "si+bl", or "" when saved unchanged
  const toFs = (f: Fields) => Object.fromEntries(FIELDS.map((x) => [FIRESTORE_KEYS[x.key], f[x.key]]));
  const updates: Doc = edits ? {
    review: { reviewed_by: moderator, edited_side: editedSide, fields: toFs(edits.bl), si_fields: toFs(edits.si) },
    status: blockers.length ? "needs_review" : flagged ? "flagged" : "cleared",
    human_review_required: flagged,
    human_review_reasons: reviewReasons,
  } : { read_status: { is_read: true, marked_by: moderator } };
  const mask = edits ? ["review.reviewed_by", "review.edited_side", "review.fields", "review.si_fields", "status", "human_review_required", "human_review_reasons"] : Object.keys(updates);
  const timeField = edits ? "review.reviewed_at" : "read_status.marked_at";
  const at = await commitAction(snapshot, updates, mask, timeField, {
    moderator_id: moderator,
    action: edits ? "review_saved" : "marked_read",
    edited_side: edits ? editedSide : null,
    changes,
    before: edits ? { review: before.review ?? null, status: before.status ?? null, human_review_required: before.human_review_required ?? null, human_review_reasons: before.human_review_reasons ?? [] } : { read_status: before.read_status ?? null },
  });
  const map = updates[edits ? "review" : "read_status"] as Doc;
  map[edits ? "reviewed_at" : "marked_at"] = at;
  // Mirror the nested mask: any other keys under `review` survive the save.
  const review = edits ? { ...((before.review as Doc | undefined) ?? {}), ...(updates.review as Doc) } : before.review;
  return toShipment({ ...before, ...updates, review });
}

// The flags a moderator resolves by clearing an email; the activity record keeps what they were.
const CLEARED = { status: "cleared", human_review_required: false, human_review_reasons: [], missing_attachments_warning: null, classification_error: null, last_ingestion_error: null };

// A moderator validates a flagged email that has no SI / BL comparison (comparisons are cleared by saving matching fields).
export async function clearEmail(moderator: string, id: string): Promise<Shipment> {
  const { snapshot, before } = await loadEmail(id);
  const current = toShipment(before);
  if (current.category === "document-comparison") throw actionError("Comparison emails are cleared by saving verified fields", 409);
  if (current.status !== "discrepancy") return current;
  const at = await commitAction(snapshot, { ...CLEARED, review: { reviewed_by: moderator } }, ["review.reviewed_by", ...Object.keys(CLEARED)], "review.reviewed_at", {
    moderator_id: moderator,
    action: "cleared",
    edited_side: null,
    changes: {},
    before: Object.fromEntries(Object.keys(CLEARED).map((k) => [k, before[k] ?? null])),
  });
  return toShipment({ ...before, ...CLEARED, review: { ...((before.review as Doc | undefined) ?? {}), reviewed_by: moderator, reviewed_at: at } });
}
