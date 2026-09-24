// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = "https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents";
const DOC = `projects/test-project/databases/(default)/documents/emails/email_001`;

type Route = (url: URL, init: RequestInit) => Response | undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Every request goes through the first route that answers; the token endpoint is always answered.
function mockFetch(...routes: Route[]) {
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.host === "oauth2.googleapis.com") return json({ access_token: "tok", expires_in: 3600 });
    for (const route of routes) {
      const res = route(url, init);
      if (res) return res;
    }
    throw new Error(`Unexpected request ${init.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const at = (path: string, body: unknown | ((init: RequestInit, url: URL) => unknown), status = 200): Route => (url, init) =>
  decodeURIComponent(url.pathname) === decodeURIComponent(new URL(BASE).pathname + path)
    ? json(typeof body === "function" ? (body as (i: RequestInit, u: URL) => unknown)(init, url) : body, status)
    : undefined;

// Firestore wire format for the values a test document uses.
const enc = (v: unknown): Record<string, unknown> => {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, enc(x)])) } };
};
const fsDoc = (name: string, data: Record<string, unknown>, updateTime = "2026-03-20T00:00:00Z") => ({
  name,
  updateTime,
  fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])),
});

const bl = { shipper: "A", consignee: "B", notify_party: "C", port_of_loading: "SGSIN", port_of_discharge: "NLRTM", container_count: "3", gross_weight_kg: "100" };

async function load() {
  vi.resetModules();
  return import("@/lib/firestore");
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REFRESH_TOKEN", "refresh");
  vi.stubEnv("FIRESTORE_PROJECT_ID", "test-project");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("toShipment", () => {
  it("maps the sender, category, date and read state", async () => {
    const { toShipment } = await load();
    const s = toShipment({
      email_id: "email_001",
      subject: "Hello",
      from: '"Jane Doe" <jane@example.com>',
      classification: "Invoice Queries",
      classified_at: "2026-03-05T20:36:00Z",
      body: "Body",
      attachments: ["a.pdf"],
      read_status: { is_read: true, marked_by: "DanielHo", marked_at: "2026-03-06T01:00:00Z" },
      status: "pending",
    });
    expect(s).toMatchObject({
      id: "email_001",
      subject: "Hello",
      sender: "jane@example.com",
      senderName: "Jane Doe",
      category: "invoice",
      rawDate: "2026-03-05",
      date: "05 Mar 2026",
      at: "2026-03-05T20:36:00.000Z",
      status: "pending",
      isRead: true,
      markedReadBy: "DanielHo",
      attachmentCount: 1,
      emailBody: "Body",
      extractedFields: null,
      referenceFields: null,
      originalExtractedFields: null,
      originalReferenceFields: null,
    });
  });

  it("uses a bare address as both sender and name, and unknown categories become spam", async () => {
    const { toShipment } = await load();
    const s = toShipment({ from: "x@example.com", classification: "Something else" });
    expect([s.sender, s.senderName, s.category]).toEqual(["x@example.com", "x@example.com", "spam"]);
  });

  it("reads the vessel and voyage from the subject, else the body", async () => {
    const { toShipment } = await load();
    const pick = (doc: Record<string, unknown>) => {
      const s = toShipment(doc);
      return `${s.vessel}|${s.voyage}`;
    };
    expect([
      pick({ subject: "RE_ Draft BL INDO SUKSES 65 V.51NW1 SINGAPORE - amend BL 057" }),
      pick({ subject: "10_01_2026 - UPDATE SUMMARY NAP 914 V.BS007" }),
      pick({ subject: "_RPA_ India HSS SD Billing Process Completed - LE HAVRE V.QI540A" }),
      pick({ subject: "Draft BL MMSS 2507 V.257087E NHAVA SHEVA", body: "Vessel SOLID 16 V.044NW2" }),
      pick({ subject: "daily Berthing Report - 01 JAN 2026", body: "Vessel MARCOPOLO 810 V.BS005 berthed on schedule." }),
      pick({ subject: "Update", body: "Attached the update summary for VISION 202 V.002. Loading completed." }),
      pick({ subject: "Pending BL Release 03_01_2026", body: "No vessel here." }),
    ]).toEqual(["INDO SUKSES 65|51NW1", "NAP 914|BS007", "LE HAVRE|QI540A", "MMSS 2507|257087E", "MARCOPOLO 810|BS005", "VISION 202|002", "|"]);
  });

  it("keeps an unparseable date as text", async () => {
    const { toShipment } = await load();
    const s = toShipment({ received_at: "yesterday" });
    expect([s.rawDate, s.date, s.at]).toEqual(["yesterday", "yesterday", ""]);
  });

  it("maps workflow statuses", async () => {
    const { toShipment } = await load();
    expect(toShipment({ status: "cleared" }).status).toBe("clean");
    expect(toShipment({ status: "flagged" }).status).toBe("discrepancy");
    expect(toShipment({ status: "incomplete" }).status).toBe("discrepancy");
    expect(toShipment({ status: "whatever" }).status).toBe("pending");
    expect(toShipment({ status: "cleared", human_review_required: true }).status).toBe("discrepancy");
  });

  it("collects review reasons from the record and from ingestion problems, without duplicates", async () => {
    const { toShipment } = await load();
    const s = toShipment({
      status: "needs_review",
      human_review_reasons: ["Check it", "Check it", "  ", 5],
      missing_attachments_warning: "Email body mentions attachments but none were provided.",
      classification_error: "timeout",
      last_ingestion_error: { filename: "x.pdf", message: "bad" },
    });
    expect(s.status).toBe("discrepancy");
    expect(s.reviewReasons).toEqual([
      "Check it",
      "Email body mentions attachments but none were provided.",
      "Email classification failed: timeout",
      "Attachment x.pdf could not be processed: bad",
    ]);
  });

  it("flags a comparison request that arrived without attachments", async () => {
    const { toShipment } = await load();
    const s = toShipment({ classification: "Document-Comparison Request", status: "pending", attachments: [] });
    expect(s.status).toBe("discrepancy");
    expect(s.reviewReasons).toEqual(["No attachments were provided. Request the missing documents from the sender."]);
  });

  it("explains older flagged records from their missing documents and discrepancies", async () => {
    const { toShipment } = await load();
    const s = toShipment({
      classification: "Document-Comparison Request",
      attachments: ["a"],
      status: "flagged",
      si: bl,
      comparison: { discrepancies: ["container_count", "not_a_field"], fields: { container_count: { si: "3", bl: "", severity: "major" } } },
    });
    expect(s.reviewReasons).toEqual([
      "Bill of Lading is missing or could not be extracted. Supply a readable document and reprocess the email.",
      "Container Count: SI 3; BL (missing). Verify the difference or missing value.",
    ]);
    expect(s.discrepancies).toEqual([{ field: "containerCount", label: "Container Count", si: "3", bl: "", note: "major" }]);
  });

  it("has a generic reason when a flag carries none", async () => {
    const { toShipment } = await load();
    expect(toShipment({ status: "flagged" }).reviewReasons).toEqual([
      "This record was flagged for human review without a recorded reason. Inspect the source email and processing history.",
    ]);
  });

  it("links only Google Drive sources that have a file name", async () => {
    const { toShipment } = await load();
    const s = toShipment({
      si_source: { filename: "si.pdf", drive_file_id: "abc/1" },
      bl_source: { filename: "bl.pdf", drive_link: "https://evil.example/bl.pdf" },
    });
    expect(s.attachmentLinks).toEqual({ "si.pdf": "https://drive.google.com/file/d/abc%2F1/view" });
    expect([s.siRef, s.blRef]).toEqual(["si.pdf", "bl.pdf"]);
    expect(toShipment({ si_source: { drive_link: "https://drive.google.com/x" } }).attachmentLinks).toEqual({});
  });

  it("prefers the moderator's overrides over the extracted documents", async () => {
    const { toShipment } = await load();
    const s = toShipment({ bl, si: bl, review: { fields: { ...bl, shipper: "BL override" }, si_fields: { ...bl, shipper: "SI override" } } });
    expect(s.extractedFields?.shipper).toBe("BL override");
    expect(s.referenceFields?.shipper).toBe("SI override");
    expect([s.originalExtractedFields?.shipper, s.originalReferenceFields?.shipper]).toEqual(["A", "A"]); // what n8n extracted, for Reset to Original
    expect(toShipment({ bl }).extractedFields).toEqual({
      shipper: "A", consignee: "B", notifyParty: "C", pol: "SGSIN", pod: "NLRTM", containerCount: "3", grossWeightKg: "100",
    });
  });

  it("builds a time-ordered audit trail", async () => {
    const { toShipment } = await load();
    const s = toShipment({
      classification: "Document-Comparison Request",
      attachments: ["a"],
      classified_at: "2026-03-05T01:00:00Z",
      status: "cleared",
      comparison: { performed_at: "2026-03-05T02:00:00Z", status: "cleared" },
      review: { reviewed_at: "2026-03-05T04:00:00Z", reviewed_by: "DanielHo", edited_side: "si+bl" },
      read_status: { marked_at: "2026-03-05T03:00:00Z" },
    });
    expect(s.auditTrail.map((t) => t.action)).toEqual([
      "Classified as Document-Comparison Request",
      "Auto-comparison: cleared",
      "Marked as read by unknown reviewer",
      "Manual verification saved by DanielHo (SI & BL edited, all matched & cleared)",
    ]);
    expect(s.auditTrail[0].time).toBe("5 Mar 2026, 01:00");
  });
});

describe("listEmails", () => {
  it("reads every page with a bearer token and decodes Firestore values", async () => {
    const fetchMock = mockFetch(
      at("/emails", (_init: RequestInit, url: URL) =>
        url.searchParams.get("pageToken")
          ? { documents: [fsDoc(`${DOC}2`, { email_id: "email_0012" })] }
          : {
              nextPageToken: "p2",
              documents: [{
                name: DOC,
                fields: {
                  email_id: { stringValue: "email_001" },
                  attachments: { arrayValue: { values: [{ stringValue: "a.pdf" }] } },
                  bl: { mapValue: { fields: { container_count: { integerValue: "3" }, gross_weight_kg: { doubleValue: 1.5 } } } },
                  human_review_required: { booleanValue: true },
                  classified_at: { timestampValue: "2026-03-05T01:00:00Z" },
                  empty_array: { arrayValue: {} },
                  nothing: { nullValue: null },
                },
              }],
            }),
    );
    const { listEmails } = await load();
    const emails = await listEmails();
    expect(emails.map((e) => e.id)).toEqual(["email_001", "email_0012"]);
    expect(emails[0].extractedFields).toMatchObject({ containerCount: "3", grossWeightKg: "1.5" });
    expect(emails[0].status).toBe("discrepancy");
    expect(emails[0].attachmentNames).toEqual(["a.pdf"]);
    const firestoreCalls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(BASE));
    expect(firestoreCalls).toHaveLength(2);
    expect((firestoreCalls[0][1]!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(new URL(String(firestoreCalls[1][0])).searchParams.get("pageToken")).toBe("p2");
  });

  it("reuses the access token until it is about to expire", async () => {
    const fetchMock = mockFetch(at("/emails", {}));
    const { listEmails } = await load();
    await listEmails();
    await listEmails();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("oauth2")).length).toBe(1);
  });

  it("fails clearly without credentials", async () => {
    vi.stubEnv("GOOGLE_REFRESH_TOKEN", "");
    mockFetch();
    const { listEmails } = await load();
    await expect(listEmails()).rejects.toThrow("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN");
  });

  it("reports a failed token refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid_grant", { status: 400 })));
    const { listEmails } = await load();
    await expect(listEmails()).rejects.toThrow("OAuth token refresh failed (400): invalid_grant");
  });

  it("reports a Firestore error with its status", async () => {
    mockFetch(() => new Response("denied", { status: 403 }));
    const { listEmails } = await load();
    await expect(listEmails()).rejects.toMatchObject({ message: "Firestore 403: denied", status: 403 });
  });
});

describe("listAuditLog", () => {
  const emails = {
    documents: [
      fsDoc(DOC, { email_id: "email_001", subject: "First", classified_at: "2026-03-05T01:00:00Z", classification: "Spam" }),
      fsDoc(`${DOC}b`, { email_id: "email/2", subject: "Second", classified_at: "2026-03-05T03:00:00Z", classification: "Invoice Queries", comparison: { performed_at: "2026-03-05T04:00:00Z", status: "flagged" } }),
    ],
  };

  it("lists what the workflow did, newest first", async () => {
    mockFetch(at("/emails", emails));
    const { listAuditLog } = await load();
    const events = await listAuditLog("system");
    expect(events.map((e) => [e.id, e.kind, e.detail])).toEqual([
      ["email/2:compared", "compared", "flagged"],
      ["email/2:classified", "classified", "Invoice Queries"],
      ["email_001:classified", "classified", "Spam"],
    ]);
    expect(events[0]).toMatchObject({ actor: "n8n Workflow", bot: true, subject: "Second", outcome: "", changes: [], fields: [] });
    expect(events[2].facts).toEqual([{ label: "From", value: "" }, { label: "Attachments", value: "None" }]);
  });

  it("details each compared field from the document's value to the normalised one", async () => {
    const port = (original: string, status: string, extra: Record<string, unknown> = {}) => ({ original, status, ...extra });
    mockFetch(at("/emails", { documents: [fsDoc(DOC, {
      email_id: "email_001", subject: "Compare", from: "Amy <amy@x.com>", attachments: ["SI_1.pdf", "BL_1.pdf"], classification_error: "timeout",
      classified_at: "2026-03-05T01:00:00Z", classification: "Document-Comparison Request",
      si: { ...bl, shipper: "Acme Pte. Ltd.", port_of_loading: "SINGAPORE, SINGAPORE (SGSIN)", container_count: 4 },
      bl: { ...bl, shipper: "ACME PTE LTD", port_of_loading: "SINGAPORE, SINGAPORE (SGSIN)", port_of_discharge: "Rotterdamm", container_count: 3 },
      si_port_validation: { port_of_loading: port("Singapore", "added", { code: "SGSIN", normalized: "SINGAPORE, SINGAPORE (SGSIN)" }) },
      bl_port_validation: { port_of_loading: port("SGSIN", "valid", { code: "SGSIN", normalized: "SINGAPORE, SINGAPORE (SGSIN)" }), port_of_discharge: port("Rotterdamm", "unknown_location", { reason: "Not a known port." }) },
      si_source: { filename: "SI_1.pdf", drive_file_id: "abc" },
      comparison: { performed_at: "2026-03-05T02:00:00Z", status: "flagged", fields: {
        shipper: { match: true, discrepancy_type: "formatting", si_normalized: "ACME PTE LTD", bl_normalized: "ACME PTE LTD" },
        consignee: { match: true },
        port_of_loading: { match: true, discrepancy_type: "formatting", si_normalized: "SINGAPORE SINGAPORE SGSIN", bl_normalized: "SINGAPORE SINGAPORE SGSIN" },
        port_of_discharge: { match: false, discrepancy_type: "real", si_normalized: "NLRTM", bl_normalized: "ROTTERDAMM" },
        container_count: { match: false, discrepancy_type: "real", si_normalized: 4, bl_normalized: 3 },
      } },
    })] }));
    const { listAuditLog } = await load();
    const [compared, classified] = await listAuditLog("system");
    expect(classified.facts).toEqual([
      { label: "From", value: "Amy <amy@x.com>" },
      { label: "Attachments", value: "SI_1.pdf, BL_1.pdf" },
      { label: "Classifier error", value: "timeout" },
    ]);
    expect(compared.facts).toEqual([
      { label: "SI document", value: "SI_1.pdf", href: "https://drive.google.com/file/d/abc/view" },
      { label: "BL document", value: "Unnamed file" },
      { label: "Blocked", value: "Email classification failed: timeout" },
    ]);
    const [shipper, consignee, pol, pod, count] = compared.fields!;
    expect(compared.fields).toHaveLength(5);
    expect(shipper).toEqual({ field: "Shipper", result: "formatting",
      si: { document: "Acme Pte. Ltd.", normalized: "ACME PTE LTD", note: "", ok: true },
      bl: { document: "ACME PTE LTD", normalized: "ACME PTE LTD", note: "", ok: true } });
    expect(consignee).toMatchObject({ result: "match", si: { document: "B", normalized: "" } });
    expect(pol).toMatchObject({ field: "Port of Loading (POL)", result: "formatting",
      si: { document: "Singapore", normalized: "SINGAPORE, SINGAPORE (SGSIN)", note: "UN/LOCODE SGSIN added", ok: true },
      bl: { document: "SGSIN", note: "UN/LOCODE SGSIN confirmed", ok: true } });
    expect(pod).toMatchObject({ result: "mismatch",
      si: { document: "NLRTM", normalized: "NLRTM", note: "Port was not validated.", ok: false },
      bl: { document: "Rotterdamm", normalized: "ROTTERDAMM", note: "Not a known port.", ok: false } });
    expect(count).toMatchObject({ result: "mismatch", si: { document: "4", normalized: "4" }, bl: { document: "3", normalized: "3" } });
  });

  it("lists moderator actions with names, outcomes and labelled changes", async () => {
    const activity = (email: string, id: string, data: Record<string, unknown>) => ({ document: fsDoc(`${BASE.slice(35)}/emails/${email}/activity/${id}`, data) });
    const fetchMock = mockFetch(
      at("/emails", emails),
      at("/moderators", { documents: [fsDoc("projects/p/databases/(default)/documents/moderators/DanielHo", { display_name: "Daniel Ho" })] }),
      at(":runQuery", [
        activity("email_001", "a1", { moderator_id: "DanielHo", action: "review_saved", edited_side: "bl", occurred_at: "2026-03-05T05:00:00Z", after: { status: "cleared" }, changes: { container_count: { before: "3", after: "4" }, extra: { before: null, after: "x" } } }),
        activity("email%2F2", "a2", { moderator_id: "Ghost", action: "marked_read", occurred_at: "2026-03-05T06:00:00Z" }),
        activity("email%2F2", "a4", { moderator_id: "DanielHo", action: "cleared", occurred_at: "2026-03-05T07:00:00Z" }),
        activity("email_001", "a3", { action: "review_saved", edited_side: "si+bl", occurred_at: "2026-03-05T04:00:00Z", after: { status: "flagged" }, changes: { si: { shipper: { before: "A", after: "B" } }, bl: { port_of_loading: { before: "X", after: "Y" } } } }),
        { document: fsDoc("not/an/activity/path", {}) },
        { readTime: "2026-03-05T00:00:00Z" },
      ]),
    );
    const { listAuditLog } = await load();
    const events = await listAuditLog("user");
    expect(events.map((e) => [e.id, e.kind, e.actor, e.outcome])).toEqual([
      ["email/2:a4", "cleared", "Daniel Ho", ""],
      ["email/2:a2", "marked_read", "Ghost", ""],
      ["email_001:a1", "review_saved", "Daniel Ho", "cleared"],
      ["email_001:a3", "review_saved", "Unknown", "flagged"],
    ]);
    expect(events[1].subject).toBe("Second");
    expect(events[2]).toMatchObject({ detail: "BL", bot: false, changes: [{ field: "Container Count", before: "3", after: "4" }, { field: "extra", before: "", after: "x" }] });
    expect(events[3]).toMatchObject({ detail: "SI & BL", changes: [{ field: "SI Shipper", before: "A", after: "B" }, { field: "BL Port of Loading (POL)", before: "X", after: "Y" }] });
    const query = fetchMock.mock.calls.find(([u]) => String(u).endsWith(":runQuery"))!;
    expect(JSON.parse(String(query[1]!.body)).structuredQuery.from).toEqual([{ collectionId: "activity", allDescendants: true }]);
  });

  it("pages through activity in batches of 500", async () => {
    const row = (i: number) => ({ document: fsDoc(`x/emails/email_001/activity/a${i}`, { action: "marked_read", occurred_at: "2026-03-05T00:00:00Z" }) });
    const offsets: unknown[] = [];
    mockFetch(
      at("/emails", { documents: [] }),
      at("/moderators", {}),
      at(":runQuery", (init: RequestInit) => {
        const { offset } = JSON.parse(String(init.body)).structuredQuery;
        offsets.push(offset);
        return Array.from({ length: offset ? 2 : 500 }, (_, i) => row(i + (offset ?? 0)));
      }),
    );
    const { listAuditLog } = await load();
    expect(await listAuditLog("user")).toHaveLength(502);
    expect(offsets).toEqual([undefined, 500]);
  });
});

describe("findModerator", () => {
  it("looks a moderator up by username and returns the id, name, role and password hash", async () => {
    let query: any;
    mockFetch(at(":runQuery", (init: RequestInit) => {
      query = JSON.parse(String(init.body)).structuredQuery;
      return [{ document: fsDoc(`${BASE.slice(35)}/moderators/DanielHo`, { display_name: "Daniel Ho", role: "moderator", username: "danielho", password_hash: "s:h" }) }];
    }));
    const { findModerator } = await load();
    expect(await findModerator("danielho")).toEqual({ id: "DanielHo", name: "Daniel Ho", role: "moderator", passwordHash: "s:h" });
    expect(query).toEqual({
      from: [{ collectionId: "moderators" }],
      where: { fieldFilter: { field: { fieldPath: "username" }, op: "EQUAL", value: { stringValue: "danielho" } } },
      limit: 1,
    });
  });

  it("falls back to the id for a name and to read-only for a missing role, and returns null for an unknown username", async () => {
    mockFetch(at(":runQuery", [{ document: fsDoc(`${BASE.slice(35)}/moderators/Ann`, {}) }]));
    const { findModerator } = await load();
    expect(await findModerator("ann")).toEqual({ id: "Ann", name: "Ann", role: "auditor", passwordHash: "" });
    mockFetch(at(":runQuery", [{ readTime: "2026-03-05T00:00:00Z" }]));
    expect(await findModerator("nobody")).toBeNull();
  });
});

describe("saveModeratorAction", () => {
  const email = (data: Record<string, unknown>) => fsDoc(DOC, { email_id: "email_001", classification: "Document-Comparison Request", attachments: ["si.pdf", "bl.pdf"], status: "cleared", si: bl, bl, ...data }, "2026-03-20T00:00:00.123Z");
  const commitResult = (n: number) => ({ writeResults: Array.from({ length: n }, () => ({ transformResults: [{ timestampValue: "2026-03-21T08:00:00Z" }] })) });

  function save(doc: unknown, { commit }: { commit?: (writes: Record<string, any>[]) => Response } = {}) {
    const writes: Record<string, any>[] = [];
    const fetchMock = mockFetch(
      at("/emails/email_001", doc),
      (url, init) => {
        if (!url.pathname.endsWith(":commit")) return;
        writes.push(...JSON.parse(String(init.body)).writes);
        return commit ? commit(writes) : json(commitResult(writes.length));
      },
    );
    return { writes, fetchMock };
  }
  const fromFs = (f: Record<string, any>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Object.values(v)[0]]));

  it("marks an email as read", async () => {
    const { writes } = save(email({}));
    const { saveModeratorAction } = await load();
    const s = await saveModeratorAction("DanielHo", "email_001");
    expect(s).toMatchObject({ isRead: true, markedReadBy: "DanielHo", markedReadAt: "2026-03-21T08:00:00Z" });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({
      update: { name: DOC },
      updateMask: { fieldPaths: ["read_status"] },
      currentDocument: { updateTime: "2026-03-20T00:00:00.123Z" },
      updateTransforms: [{ fieldPath: "read_status.marked_at", setToServerValue: "REQUEST_TIME" }],
    });
    expect(writes[1].update.name).toMatch(new RegExp(`^${DOC.replace(/[()]/g, "\\$&")}/activity/[0-9a-f-]{36}$`));
    expect(fromFs(writes[1].update.fields)).toMatchObject({ moderator_id: "DanielHo", action: "marked_read", edited_side: null });
    expect(writes[1].currentDocument).toEqual({ exists: false });
  });

  it("does nothing when the email is already read", async () => {
    const { fetchMock } = save(email({ read_status: { is_read: true } }));
    const { saveModeratorAction } = await load();
    expect((await saveModeratorAction("DanielHo", "email_001")).isRead).toBe(true);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith(":commit"))).toBe(false);
  });

  const input = { shipper: "A", consignee: "B", notifyParty: "C", pol: "SGSIN", pod: "NLRTM", containerCount: "3", grossWeightKg: "100" };

  it("saves the SI and BL together as cleared and records what changed on each", async () => {
    const { writes } = save(email({ bl: { ...bl, shipper: "Old" } }));
    const { saveModeratorAction } = await load();
    const s = await saveModeratorAction("DanielHo", "email_001", { si: input, bl: input });
    expect(s).toMatchObject({ status: "clean", reviewedBy: "DanielHo", reviewedAt: "2026-03-21T08:00:00Z", extractedFields: input, referenceFields: input });
    expect(s.originalExtractedFields?.shipper).toBe("Old"); // the n8n original is never overwritten
    expect(writes[0].updateMask.fieldPaths).toEqual(["review.reviewed_by", "review.edited_side", "review.fields", "review.si_fields", "status", "human_review_required", "human_review_reasons"]);
    expect(fromFs(writes[0].update.fields)).toMatchObject({ status: "cleared", human_review_required: false });
    const activity = writes[1].update.fields;
    expect(activity.action).toEqual({ stringValue: "review_saved" });
    expect(activity.edited_side).toEqual({ stringValue: "bl" }); // only the BL changed
    expect(Object.keys(activity.changes.mapValue.fields)).toEqual(["bl"]);
    expect(Object.keys(activity.changes.mapValue.fields.bl.mapValue.fields)).toEqual(["shipper"]);
  });

  it("names both documents when both changed", async () => {
    const { writes } = save(email({}));
    const { saveModeratorAction } = await load();
    await saveModeratorAction("DanielHo", "email_001", { si: { ...input, shipper: "S" }, bl: { ...input, shipper: "S" } });
    expect(fromFs(writes[1].update.fields).edited_side).toBe("si+bl");
    expect(Object.keys(writes[1].update.fields.changes.mapValue.fields)).toEqual(["si", "bl"]);
  });

  it("flags fields that still differ between the documents", async () => {
    const { writes } = save(email({}));
    const { saveModeratorAction } = await load();
    const s = await saveModeratorAction("DanielHo", "email_001", { si: input, bl: { ...input, containerCount: "4" } });
    expect(s.status).toBe("discrepancy");
    expect(s.reviewReasons).toEqual(["Container Count differs between SI and BL after manual verification."]);
    expect(fromFs(writes[0].update.fields)).toMatchObject({ status: "flagged", human_review_required: true });
  });

  it("keeps ingestion problems as needs_review", async () => {
    const { writes } = save(email({ classification_error: "timeout" }));
    const { saveModeratorAction } = await load();
    const s = await saveModeratorAction("DanielHo", "email_001", { si: input, bl: input });
    expect(fromFs(writes[0].update.fields).status).toBe("needs_review");
    expect(s.reviewReasons).toContain("Email classification failed: timeout");
  });

  it("refuses edits unless both documents were extracted", async () => {
    save(email({ si: null }));
    const { saveModeratorAction } = await load();
    await expect(saveModeratorAction("DanielHo", "email_001", {} as never)).rejects.toMatchObject({ status: 409, message: "Shipping Instruction and Draft BL must both be extracted before editing" });
  });

  it("reports a missing email as 404", async () => {
    mockFetch(at("/emails/nope", { error: "x" }, 404));
    const { saveModeratorAction } = await load();
    await expect(saveModeratorAction("DanielHo", "nope")).rejects.toMatchObject({ status: 404, message: "Email not found" });
  });

  it("passes on other read errors", async () => {
    mockFetch(at("/emails/email_001", "boom", 500));
    const { saveModeratorAction } = await load();
    await expect(saveModeratorAction("DanielHo", "email_001")).rejects.toMatchObject({ status: 500 });
  });

  it("turns a concurrent change into a 409 retry message", async () => {
    save(email({}), { commit: () => new Response("FAILED_PRECONDITION: stale", { status: 400 }) });
    const { saveModeratorAction } = await load();
    await expect(saveModeratorAction("DanielHo", "email_001")).rejects.toMatchObject({ status: 409, message: "The record changed while saving. Refresh and try again." });
  });

  it("passes on other commit errors", async () => {
    save(email({}), { commit: () => new Response("nope", { status: 500 }) });
    const { saveModeratorAction } = await load();
    await expect(saveModeratorAction("DanielHo", "email_001")).rejects.toMatchObject({ status: 500, message: "Firestore 500: nope" });
  });
});

describe("clearEmail", () => {
  const invoice = (data: Record<string, unknown>) => fsDoc(DOC, { email_id: "email_001", classification: "Invoice Queries", status: "needs_review", human_review_required: true, human_review_reasons: ["Check the amount"], classification_error: "timeout", ...data });
  const fromFs = (f: Record<string, any>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Object.values(v)[0]]));
  function clear(doc: unknown) {
    const writes: Record<string, any>[] = [];
    const fetchMock = mockFetch(at("/emails/email_001", doc), (url, init) => {
      if (!url.pathname.endsWith(":commit")) return;
      writes.push(...JSON.parse(String(init.body)).writes);
      return json({ writeResults: [{ transformResults: [{ timestampValue: "2026-03-21T08:00:00Z" }] }, {}] });
    });
    return { writes, fetchMock };
  }

  it("clears a flagged email, resolves its ingestion problems and records what was flagged", async () => {
    const { writes } = clear(invoice({ review: { note: "kept" } }));
    const { clearEmail } = await load();
    const s = await clearEmail("DanielHo", "email_001");
    expect(s).toMatchObject({ status: "clean", reviewReasons: [], reviewedBy: "DanielHo", reviewedAt: "2026-03-21T08:00:00Z" });
    expect(s.auditTrail.at(-1)!.action).toBe("Cleared by DanielHo");
    expect(writes[0].updateMask.fieldPaths).toEqual(["review.reviewed_by", "status", "human_review_required", "human_review_reasons", "missing_attachments_warning", "classification_error", "last_ingestion_error"]);
    expect(writes[0].updateTransforms).toEqual([{ fieldPath: "review.reviewed_at", setToServerValue: "REQUEST_TIME" }]);
    expect(fromFs(writes[0].update.fields)).toMatchObject({ status: "cleared", human_review_required: false, classification_error: null });
    const activity = writes[1].update.fields;
    expect(activity.action).toEqual({ stringValue: "cleared" });
    expect(fromFs(activity.before.mapValue.fields)).toMatchObject({ status: "needs_review", human_review_required: true, classification_error: "timeout", last_ingestion_error: null });
  });

  it("leaves an email that needs no review alone", async () => {
    const { fetchMock } = clear(invoice({ status: "", human_review_required: false, human_review_reasons: [], classification_error: null }));
    const { clearEmail } = await load();
    expect((await clearEmail("DanielHo", "email_001")).status).toBe("pending");
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith(":commit"))).toBe(false);
  });

  it("refuses a comparison email, which is cleared by saving its fields", async () => {
    clear(invoice({ classification: "Document-Comparison Request" }));
    const { clearEmail } = await load();
    await expect(clearEmail("DanielHo", "email_001")).rejects.toMatchObject({ status: 409, message: "Comparison emails are cleared by saving verified fields" });
  });
});
