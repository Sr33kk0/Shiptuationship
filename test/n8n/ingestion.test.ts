// @vitest-environment node
import { describe, expect, it } from "vitest";
import { codeNode, type Item } from "./harness";

const node = (name: string) => codeNode("ingestion", name);
const b64 = (s: string, encoding: BufferEncoding = "utf8") => Buffer.from(s, encoding).toString("base64");

// Firestore wire format, as the Read Email Doc node returns it.
const enc = (v: unknown): Record<string, unknown> => {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, enc(x)])) } };
};
const fsFields = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)]));
const plain = (f: Record<string, Record<string, unknown>>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Object.values(v)[0]]));

describe("Compare Fields", () => {
  const run = node("Compare Fields");
  const validPorts = { port_of_loading: { status: "valid" }, port_of_discharge: { status: "valid" } };
  const bl = { shipper: "Meridian Textiles Sdn Bhd", consignee: "Harbor & Vale Imports Ltd", notify_party: "Harbor & Vale Imports Ltd", port_of_loading: "PORT KLANG, MALAYSIA (MYPKG)", port_of_discharge: "ROTTERDAM, NETHERLANDS (NLRTM)", container_count: 3, gross_weight_kg: 22000 };
  const email = (over: Record<string, unknown> = {}) => ({
    json: { fields: fsFields({ email_id: "email_004", classification: "Document-Comparison Request", attachment_count: 2, status: "pending", bl, si: bl, bl_port_validation: validPorts, si_port_validation: validPorts, ...over }) },
  });
  const compare = async (over: Record<string, unknown> = {}) => {
    const { json } = await run(email(over));
    const f = json.firestore_document.fields;
    const cmp = f.comparison.mapValue.fields;
    return {
      emailId: json.email_id,
      status: f.status.stringValue,
      review: f.human_review_required.booleanValue,
      reasons: f.human_review_reasons.arrayValue.values.map((v: { stringValue: string }) => v.stringValue),
      comparison: cmp.status.stringValue,
      discrepancies: cmp.discrepancies.arrayValue.values.map((v: { stringValue: string }) => v.stringValue),
      notes: cmp.formatting_notes.arrayValue.values.map((v: { stringValue: string }) => v.stringValue),
      field: (name: string) => plain(cmp.fields.mapValue.fields[name].mapValue.fields),
    };
  };

  it("clears matching documents", async () => {
    const r = await compare();
    expect(r).toMatchObject({ emailId: "email_004", status: "cleared", review: false, comparison: "cleared", discrepancies: [], notes: [], reasons: [] });
    expect(r.field("shipper")).toEqual({ match: true, bl: "Meridian Textiles Sdn Bhd", si: "Meridian Textiles Sdn Bhd" });
  });

  it("treats spelling, company suffix, order and 'same as consignee' differences as formatting only", async () => {
    const r = await compare({
      si: { ...bl, shipper: "MERIDIAN TEXTILES SENDIRIAN BERHAD", consignee: "To Order of Harbor and Vale Imports Limited", notify_party: "Same as consignee", container_count: "3", gross_weight_kg: 22000.0005 },
    });
    expect(r.status).toBe("cleared");
    expect(r.notes).toEqual(["shipper", "consignee", "notify_party", "container_count", "gross_weight_kg"]);
    expect(r.field("shipper")).toMatchObject({ match: true, discrepancy_type: "formatting", bl_normalized: "MERIDIAN TEXTILES SDN BHD", si_normalized: "MERIDIAN TEXTILES SDN BHD" });
  });

  it("flags a different container count", async () => {
    const r = await compare({ si: { ...bl, container_count: 4 } });
    expect(r).toMatchObject({ status: "flagged", review: true, comparison: "flagged", discrepancies: ["container_count"] });
    expect(r.reasons).toEqual(["Container Count: Values differ, are missing, or could not be validated. Verify against the source documents."]);
    expect(r.field("container_count")).toMatchObject({ match: false, bl: "3", si: "4", discrepancy_type: "real", severity: "major" });
  });

  it("allows a gram of rounding in the weight, no more", async () => {
    expect((await compare({ si: { ...bl, gross_weight_kg: 22000.001 } })).discrepancies).toEqual([]);
    expect((await compare({ si: { ...bl, gross_weight_kg: 22000.01 } })).discrepancies).toEqual(["gross_weight_kg"]);
  });

  it("flags values missing on either side", async () => {
    const r = await compare({ si: { ...bl, shipper: "N/A", consignee: "", container_count: null }, bl: { ...bl, gross_weight_kg: "-- KGS" } });
    expect(r.discrepancies).toEqual(["shipper", "consignee", "container_count", "gross_weight_kg"]);
  });

  it("flags numbers it cannot read and fractional container counts", async () => {
    expect((await compare({ si: { ...bl, gross_weight_kg: "22,000" }, bl: { ...bl, gross_weight_kg: "22,000" } })).discrepancies).toEqual(["gross_weight_kg"]);
    expect((await compare({ si: { ...bl, container_count: 2.5 }, bl: { ...bl, container_count: 2.5 } })).discrepancies).toEqual(["container_count"]);
  });

  it("flags a port that was not validated, with the validator's reason", async () => {
    const r = await compare({ si_port_validation: { port_of_loading: { status: "ambiguous", reason: "Two ports match." }, port_of_discharge: { status: "added" } } });
    expect(r.discrepancies).toEqual(["port_of_loading"]);
    expect(r.reasons[0]).toBe("SI - Port of Loading: Two ports match.");
    const missing = await compare({ bl_port_validation: {} });
    expect(missing.reasons.slice(0, 2)).toEqual(["BL - Port of Loading: Port was not validated. Reprocess this document.", "BL - Port of Discharge: Port was not validated. Reprocess this document."]);
  });

  it("notes a port written differently before validation", async () => {
    const ports = (original: string) => ({ port_of_loading: { status: "valid", original }, port_of_discharge: { status: "valid" } });
    const r = await compare({ bl_port_validation: ports("Port Klang (MYPKG)"), si_port_validation: ports("PORT KLANG, MY") });
    expect(r.notes).toEqual(["port_of_loading"]);
  });

  it("marks a comparison request without a BL as incomplete", async () => {
    const r = await compare({ bl: null });
    expect(r).toMatchObject({ status: "incomplete", review: true, comparison: "incomplete", discrepancies: [] });
    expect(r.reasons).toEqual(["Bill of Lading is missing or could not be extracted. Supply a readable BL and reprocess the email."]);
  });

  it("leaves other emails without documents as they were", async () => {
    const r = await compare({ classification: "Invoice Queries", bl: null, si: null, status: "pending" });
    expect(r).toMatchObject({ status: "pending", review: false, comparison: "incomplete", reasons: [] });
  });

  it("sends ingestion problems to review", async () => {
    const noFiles = await compare({ bl: null, si: null, attachment_count: 0 });
    expect(noFiles.status).toBe("needs_review");
    expect(noFiles.reasons).toContain("No attachments were provided for the BL/SI comparison. Request both documents from the sender.");

    const failed = await compare({ classification_error: "timeout", last_ingestion_error: { filename: "bl.pdf", message: "unreadable" } });
    expect(failed).toMatchObject({ status: "needs_review", review: true, comparison: "incomplete" });
    expect(failed.reasons).toEqual(["Email classification failed: timeout", "Attachment bl.pdf could not be processed: unreadable"]);

    const warned = await compare({ missing_attachments_warning: "Email body mentions attachments but none were provided.", attachment_count: 0 });
    expect(warned.reasons).toEqual(["Email body mentions attachments but none were provided."]);
  });
});

describe("Check Port Code", () => {
  const run = node("Check Port Code");
  const check = async (port: unknown) => (await run({ json: { email_id: "e", extracted_fields: { port_of_loading: port, port_of_discharge: "SGSIN", shipper: "A" } } })).json;

  it("confirms a name that matches its UN/LOCODE and normalises the field", async () => {
    const out = await check("Nantong, China (CNNTG)");
    expect(out.port_validation.port_of_loading).toEqual({ original: "Nantong, China (CNNTG)", normalized: "NANTONG, CHINA (CNNTG)", code: "CNNTG", status: "valid", reason: null });
    expect(out.extracted_fields).toEqual({ port_of_loading: "NANTONG, CHINA (CNNTG)", port_of_discharge: "SINGAPORE, SINGAPORE (SGSIN)", shipper: "A" });
    expect(out.port_validation.dataset_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.email_id).toBe("e");
  });

  it("accepts a code on its own", async () => {
    expect((await check("SGSIN")).port_validation.port_of_loading).toMatchObject({ status: "valid", code: "SGSIN", normalized: "SINGAPORE, SINGAPORE (SGSIN)" });
  });

  it("adds the code for a name that matches exactly one port", async () => {
    expect((await check("Rotterdam, Netherlands")).port_validation.port_of_loading).toMatchObject({ status: "added", code: "NLRTM", normalized: "ROTTERDAM, NETHERLANDS (NLRTM)" });
    expect((await check("Tanjung Pelepas, MY")).port_validation.port_of_loading).toMatchObject({ status: "added", code: "MYTPP" });
    expect((await check("Los Angeles, CA, USA")).port_validation.port_of_loading).toMatchObject({ status: "added", code: "USLAX" });
  });

  it("leaves the field as written when the port is not certain", async () => {
    const cases: [unknown, string, string][] = [
      ["Rotterdam", "ambiguous", 'matches 2 UN/LOCODEs'],
      ["Rotterdam, Germany (NLRTM)", "mismatch", "Country GERMANY conflicts with Rotterdam, NETHERLANDS (NLRTM)."],
      ["Somewhere (ZZZZZ)", "unknown_code", "UN/LOCODE ZZZZZ is not a known port code."],
      ["Busan (KRPUS) (CNSHA)", "ambiguous", "Multiple UN/LOCODEs were provided."],
      ["Atlantisville", "unknown_location", "is not a known port"],
      ["China", "missing", "A country alone does not identify a port."],
      ["N/A", "missing", "No readable port location or UN/LOCODE was provided."],
      [null, "missing", "No readable port location or UN/LOCODE was provided."],
    ];
    for (const [port, status, reason] of cases) {
      const out = await check(port);
      expect(out.port_validation.port_of_loading.status, String(port)).toBe(status);
      expect(out.port_validation.port_of_loading.reason).toContain(reason);
      expect(out.extracted_fields.port_of_loading).toBe(port);
    }
  });

  it("requires the parsed fields", async () => {
    await expect(run({ json: {} })).rejects.toThrow("Check Port Code requires parsed extracted_fields");
  });
}, 60_000);

describe("Validate Classification", () => {
  const run = node("Validate Classification");
  const classify = async (result: Record<string, unknown>, email: Record<string, unknown> = {}) =>
    (await run({ json: result }, { "Normalize Email": { json: { email_id: "e", body: "", attachments: [], ...email } } })).json;

  it("reads the classifier's JSON, with or without code fences", async () => {
    expect(await classify({ text: '```json\n{"classification":"Invoice Queries"}\n```' })).toMatchObject({ email_id: "e", classification: "Invoice Queries", classification_error: null });
    expect((await classify({ output: { classification: "General Messages" } })).classification).toBe("General Messages");
  });

  it("falls back to Spam with the reason when classification fails", async () => {
    expect(await classify({ output: { classification: "Urgent" } })).toMatchObject({ classification: "Spam", classification_error: "Classifier returned an invalid category." });
    expect(await classify({ error: { message: "quota exceeded" } })).toMatchObject({ classification: "Spam", classification_error: "quota exceeded" });
    expect((await classify({ text: "not json" })).classification_error).toMatch(/JSON/);
  });

  it("turns a New SI Request that asks to compare the SI and BL into a comparison request", async () => {
    const si = { output: { classification: "New SI Request" } };
    expect((await classify(si, { body: "Please compare the SI against the draft BL." })).classification).toBe("Document-Comparison Request");
    expect((await classify(si, { body: "Please check the attached documents.", attachments: ["SI_123.pdf", "BL_123.pdf"] })).classification).toBe("Document-Comparison Request");
  });

  it("keeps a New SI Request that asks for documents, or only quotes a comparison", async () => {
    const si = { output: { classification: "New SI Request" } };
    expect((await classify(si, { body: "Please review and send the SI so we can issue the BL." })).classification).toBe("New SI Request");
    expect((await classify(si, { body: "Thanks.\n> Please compare the SI and BL" })).classification).toBe("New SI Request");
    expect((await classify({ output: { classification: "General Messages" } }, { body: "Please compare the SI against the BL." })).classification).toBe("General Messages");
  });
});

describe("Normalize Email", () => {
  const run = node("Normalize Email");
  const start = { Start: { json: { id: "drive-1", name: "email_004.json" } } };

  it("normalises the email, taking the id from the file name", async () => {
    const { json } = await run({ json: { data: { subject: "SI", body: "Please see attached SI.", sender: "a@x.com", recipient: "b@y.com", date: "2026-03-20", attachments: ["C:\\docs\\SI.pdf", { filename: "BL.pdf" }, "other/SI.pdf"] } } }, start);
    expect(json).toEqual({
      email_id: "email_004", subject: "SI", body: "Please see attached SI.", from: "a@x.com", to: "b@y.com", received_at: "2026-03-20",
      attachments: ["SI.pdf", "BL.pdf"], source_email_file_id: "drive-1", body_mentions_attachments: true,
    });
  });

  it("prefers the email's own id and writes structured bodies as JSON", async () => {
    const { json } = await run({ json: { id: "gmail_1", body: { text: "hi" }, attachments: null } }, start);
    expect([json.email_id, json.body, json.attachments, json.body_mentions_attachments]).toEqual(["gmail_1", '{"text":"hi"}', [], false]);
  });

  it("rejects malformed emails", async () => {
    await expect(run({ json: { data: [] } }, start)).rejects.toThrow("Expected one email JSON object.");
    await expect(run({ json: { id: "../x" } }, start)).rejects.toThrow("Email ID must contain letters, numbers, underscores or hyphens.");
    await expect(run({ json: { id: "a", attachments: "x.pdf" } }, start)).rejects.toThrow("attachments must be an array");
    await expect(run({ json: { id: "a", attachments: [{}] } }, start)).rejects.toThrow("Each attachment needs a filename.");
    await expect(run({ json: { id: "a", attachments: ["dir/"] } }, start)).rejects.toThrow("Attachment path has no filename.");
  });
});

describe("Prepare Email Log", () => {
  const run = node("Prepare Email Log");
  const log = async (over: Record<string, unknown>) => {
    const { json } = await run({ json: { email_id: "e", subject: "s", body: "b", attachments: ["a.pdf", "b.pdf"], classification: "General Messages", classification_error: null, body_mentions_attachments: false, ...over } });
    return json.firestore_document.fields;
  };
  const reasons = (f: Record<string, any>) => f.human_review_reasons.arrayValue.values.map((v: { stringValue: string }) => v.stringValue);

  it("logs a normal email as pending", async () => {
    const f = await log({});
    expect(f).toMatchObject({ status: { stringValue: "pending" }, human_review_required: { booleanValue: false }, attachment_count: { integerValue: "2" }, classification_error: { nullValue: null }, missing_attachments_warning: { nullValue: null } });
    expect(f.attachments.arrayValue.values).toEqual([{ stringValue: "a.pdf" }, { stringValue: "b.pdf" }]);
    expect(f.to).toEqual({ stringValue: "" });
  });

  it("flags attachments the body mentions but the email lacks", async () => {
    const f = await log({ attachments: [], body_mentions_attachments: true, classification: "Document-Comparison Request" });
    expect(f.status).toEqual({ stringValue: "needs_review" });
    expect(reasons(f)).toEqual(["Email body mentions attachments but none were provided."]);
  });

  it("flags a comparison request with no attachments and a failed classification", async () => {
    expect(reasons(await log({ attachments: [], classification: "Document-Comparison Request" }))).toEqual(["No attachments were provided for the BL/SI comparison. Request both documents from the sender."]);
    expect(reasons(await log({ classification_error: "timeout" }))).toEqual(["Email classification failed: timeout"]);
  });
});

describe("Prepare for Firestore", () => {
  const run = node("Prepare for Firestore");
  const extraction = { shipper: "  Acme  ", consignee: "", notify_party: null, port_of_loading: "SGSIN", port_of_discharge: "NLRTM", container_count: 3, gross_weight_kg: 22000.5 };
  const input = (over: Record<string, unknown> = {}) => ({ json: { email_id: "email_004", document_type: "SI", filename: "email_004_SI.pdf", source_file_id: "a/b", extracted_fields: extraction, port_validation: { dataset_sha256: "abc", port_of_loading: { status: "valid", code: "SGSIN", reason: null } }, ...over } });

  it("writes one side's fields, port checks and source", async () => {
    const { json } = await run(input());
    const f = json.firestore_document.fields;
    expect(json.email_id).toBe("email_004");
    expect(f.si.mapValue.fields).toEqual({
      shipper: { stringValue: "Acme" }, consignee: { nullValue: null }, notify_party: { nullValue: null }, port_of_loading: { stringValue: "SGSIN" },
      port_of_discharge: { stringValue: "NLRTM" }, container_count: { integerValue: "3" }, gross_weight_kg: { doubleValue: 22000.5 },
    });
    expect(f.si_port_validation.mapValue.fields.port_of_loading.mapValue.fields).toEqual({ status: { stringValue: "valid" }, code: { stringValue: "SGSIN" }, reason: { nullValue: null } });
    expect(f.si_source.mapValue.fields).toEqual({ drive_file_id: { stringValue: "a/b" }, drive_link: { stringValue: "https://drive.google.com/file/d/a%2Fb/view" }, filename: { stringValue: "email_004_SI.pdf" } });
    expect(f).not.toHaveProperty("bl");
  });

  it("writes nulls for a missing source", async () => {
    const { json } = await run(input({ document_type: "BL", source_file_id: "", filename: "" }));
    expect(json.firestore_document.fields.bl_source.mapValue.fields).toEqual({ drive_file_id: { nullValue: null }, drive_link: { nullValue: null }, filename: { nullValue: null } });
  });

  it("refuses bad extractions instead of overwriting stored data", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ email_id: "a.b" }, "Expected a filename-based email ID"],
      [{ document_type: "INVOICE" }, "document_type must be BL or SI."],
      [{ extracted_fields: [] }, "extracted_fields must be an object."],
      [{ extracted_fields: { note: "x" } }, "Extraction contains none of the seven shipment fields"],
      [{ extracted_fields: { shipper: 5 } }, "shipper must be a string or null."],
      [{ extracted_fields: { gross_weight_kg: -1 } }, "gross_weight_kg must be a non-negative number or null."],
      [{ extracted_fields: { gross_weight_kg: "22000" } }, "gross_weight_kg must be a non-negative number or null."],
      [{ extracted_fields: { container_count: 2.5 } }, "container_count must be a safe integer."],
      [{ port_validation: {} }, "Port validation is missing"],
    ];
    for (const [over, message] of cases) await expect(run(input(over)), message).rejects.toThrow(message);
  });
});

describe("Re-attach Metadata", () => {
  const run = node("Re-attach Metadata");
  const meta = (hint: string) => ({ "Normalize & Tag Data": { json: { email_id: "e", filename: "f.pdf", source_file_id: "id", document_type_hint: hint } } });

  it("parses the model's JSON and splits off the document type", async () => {
    const out = await run({ json: { text: '```json\n{"document_type":"BL","shipper":"A"}\n```' } }, meta("UNKNOWN"));
    expect(out).toEqual({ json: { email_id: "e", filename: "f.pdf", source_file_id: "id", document_type: "BL", extracted_fields: { shipper: "A" } } });
    expect((await run({ json: { output: { document_type: "SI" } } }, meta("SI"))).json.document_type).toBe("SI");
  });

  it("rejects output it cannot trust", async () => {
    await expect(run({ json: { text: "{oops" } }, meta("UNKNOWN"))).rejects.toThrow("Field Normalise returned invalid JSON.");
    await expect(run({ json: { text: "[1]" } }, meta("UNKNOWN"))).rejects.toThrow("Field Normalise must return an object.");
    await expect(run({ json: { output: { document_type: "PO" } } }, meta("UNKNOWN"))).rejects.toThrow("Document is not identifiable as BL or SI");
    await expect(run({ json: { output: { document_type: "SI" } } }, meta("BL"))).rejects.toThrow("Document type disagrees with the BL/SI filename");
  });
});

describe("Normalize & Tag Data", () => {
  const run = node("Normalize & Tag Data");
  const tag = (json: Record<string, unknown>, filename = "email_004_BL.pdf") => run({ json }, { "Validate Attachment Match": { json: { email_id: "e", filename, source_file_id: "id" } } });

  it("trims the text and reads BL or SI from the file name", async () => {
    expect((await tag({ text: "  Shipper: Acme \n" })).json).toEqual({ email_id: "e", filename: "email_004_BL.pdf", source_file_id: "id", document_type_hint: "BL", document_text: "Shipper: Acme" });
    expect((await tag({ document_text: "x" }, "draft-si.docx")).json.document_type_hint).toBe("SI");
    expect((await tag({ data: "x" }, "BLUE_invoice.pdf")).json.document_type_hint).toBe("UNKNOWN");
  });

  it("rejects empty, unreadable or oversized text", async () => {
    await expect(tag({ text: "   " })).rejects.toThrow("No readable document text.");
    await expect(tag({ text: "---" })).rejects.toThrow("unreadable or corrupted text");
    await expect(tag({ text: "Shipper\u0000" })).rejects.toThrow("unreadable or corrupted text");
    await expect(tag({ text: "\uFFFDabc" })).rejects.toThrow("unreadable or corrupted text");
    await expect(tag({ text: "a".repeat(60_001) })).rejects.toThrow("60,000-character extraction limit");
  });
});

describe("Read DOCX Text", () => {
  const run = node("Read DOCX Text");
  const part = (directory: string, fileName: string, xml: string, encoding: BufferEncoding = "utf8") => ({ directory, fileName, data: b64(xml, encoding) });
  const body =
    '<w:document><w:body><!-- note --><w:p><w:r><w:t>Shipper:</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> ACME &amp; Co</w:t></w:r></w:p>' +
    "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>POL</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>SGSIN</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
    "<w:p><w:r><w:t><![CDATA[a<b]]></w:t><w:t>&#65;&#x42;&#0;</w:t><w:br/><w:t>Line</w:t><w:noBreakHyphen/><w:t>2</w:t></w:r></w:p></w:body></w:document>";

  it("keeps paragraph, tab and table structure, decoding entities", async () => {
    const [out] = await run({ json: { email_id: "e" }, binary: { a: part("word", "document.xml", body) } });
    expect(out.json).toEqual({ email_id: "e", document_text: "Shipper:\t ACME & Co\nPOL\tSGSIN\na<bAB&#0;\nLine\u20112" });
  });

  it("reads headers first and footers last, and UTF-16 parts", async () => {
    const [out] = await run({
      json: {},
      binary: {
        f: part("./word", "footer1.xml", "<w:p><w:t>Footer</w:t></w:p>"),
        m: part("word", "document.xml", "<w:p><w:t>Main</w:t></w:p>"),
        h: part("word", "header1.xml", "\uFEFF<w:p><w:t>Header</w:t></w:p>", "utf16le"),
        x: part("word", "styles.xml", "<w:t>ignored</w:t>"),
      },
    });
    expect(out.json.document_text).toBe("Header\n\nMain\n\nFooter");
  });

  it("rejects archives that are not documents or have no text", async () => {
    await expect(run({ json: {}, binary: { a: part("", "other.xml", "") } })).rejects.toThrow("DOCX archive has no word/document.xml.");
    await expect(run({ json: {}, binary: { a: part("word", "document.xml", "<w:p></w:p>") } })).rejects.toThrow("DOCX contains no readable text");
  });
});

describe("OCR nodes", () => {
  const page = (n: number, text = `page ${n}`) => ({ context: { pageNumber: n }, fullTextAnnotation: { text } });
  const reply = (...pages: unknown[]) => ({ json: { responses: [{ responses: pages }] } });
  const built = { "Build Vision Request1": [{ json: { pages: [1, 2, 3, 4, 5] } }, { json: { pages: [6] } }] };

  it("Build Vision Request1 asks for at most five pages per request", async () => {
    const out = await node("Build Vision Request1")({ json: { numpages: 12 }, binary: { data: { data: b64("%PDF") } } });
    expect(out.map((o: { json: { pages: number[] } }) => o.json.pages)).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
    expect(out[0].json.body.requests[0]).toMatchObject({ inputConfig: { mimeType: "application/pdf", content: b64("%PDF") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] });
  });

  it("Build Vision Request1 falls back to the downloaded file", async () => {
    const run = node("Build Vision Request1");
    const out = await run({ json: {} }, { "Download File": { json: {}, binary: { data: { data: b64("%PDF") } } } });
    expect(out).toHaveLength(1);
    await expect(run({ json: {} }, { "Download File": { json: {}, binary: { data: { id: "fs:1" } } } })).rejects.toThrow("PDF binary missing.");
  });

  it("Collect OCR Text1 joins every page in order", async () => {
    const out = await node("Collect OCR Text1")([reply(page(1), page(2), page(3), page(4), page(5)), reply(page(6))], built);
    expect(out).toEqual([{ json: { text: "page 1\npage 2\npage 3\npage 4\npage 5\npage 6", ocr: "google-vision" }, pairedItem: { item: 0 } }]);
  });

  it("Collect OCR Text1 rejects partial or failed OCR", async () => {
    const run = node("Collect OCR Text1");
    await expect(run([reply(page(1), page(2), page(3), page(4), page(5))], built)).rejects.toThrow("incomplete PDF pages");
    await expect(run([reply(page(1), page(1), page(3), page(4), page(5)), reply(page(6))], built)).rejects.toThrow("incomplete PDF pages");
    await expect(run([{ json: { error: { message: "quota" } } }], built)).rejects.toThrow("Google Vision OCR failed: quota");
    await expect(run([{ json: { responses: [] } }], built)).rejects.toThrow("returned no file result");
    await expect(run([{ json: { responses: [{ error: "bad file" }] } }], built)).rejects.toThrow("Google Vision OCR failed: bad file");
    await expect(run([reply()], built)).rejects.toThrow("returned no pages");
    await expect(run([reply({ error: { message: "page broke" } })], built)).rejects.toThrow("OCR page failed: page broke");
    await expect(run([reply(page(1, " "), page(2, ""), page(3, ""), page(4, ""), page(5, "")), reply(page(6, ""))], built)).rejects.toThrow("no readable text in the PDF");
  });

  it("Build Image Vision Request sends the image", async () => {
    const run = node("Build Image Vision Request");
    const [out] = await run({ json: {}, binary: { img: { data: b64("PNG") } } });
    expect(out.json.body.requests[0]).toEqual({ image: { content: b64("PNG") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] });
    await expect(run({ json: {} })).rejects.toThrow("Image binary missing.");
  });

  it("Collect Image OCR Text reads the image text", async () => {
    const run = node("Collect Image OCR Text");
    expect(await run({ json: { responses: [{ fullTextAnnotation: { text: " BL 123 " } }] } })).toEqual([{ json: { text: "BL 123", ocr: "google-vision" }, pairedItem: { item: 0 } }]);
    await expect(run({ json: { error: { message: "quota" } } })).rejects.toThrow("image OCR failed: quota");
    await expect(run({ json: { responses: [] } })).rejects.toThrow("returned no image result");
    await expect(run({ json: { responses: [{ error: "bad" }] } })).rejects.toThrow("image OCR failed: bad");
    await expect(run({ json: { responses: [{}] } })).rejects.toThrow("no readable text in the image");
  });
});

describe("attachment handling", () => {
  it("Combine Excel Rows writes rows as tab-separated lines", async () => {
    const run = node("Combine Excel Rows");
    expect(await run([{ json: { row: { a: "Shipper", b: "Acme" } } }, { json: { a: null, b: 3 } }])).toEqual([{ json: { document_text: "Shipper\tAcme\n\t3" }, pairedItem: { item: 0 } }]);
    await expect(run([{ json: { a: " " } }])).rejects.toThrow("no readable cells");
  });

  it("DOCX as ZIP relabels the file for unzipping", async () => {
    const run = node("DOCX as ZIP");
    expect(await run({ json: { a: 1 }, binary: { data: { fileName: "x.docx", mimeType: "application/msword" } } })).toEqual({
      json: { a: 1 }, binary: { data: { fileName: "x.docx", mimeType: "application/zip", fileExtension: "zip" } },
    });
    await expect(run({ json: {} })).rejects.toThrow("DOCX binary data is missing.");
  });

  it("Expand Attachments makes one item per attachment", async () => {
    const out = await node("Expand Attachments")([{ json: {} }], { "Prepare Email Log": { json: { email_id: "e", attachments: ["a.pdf", "b.pdf"] } } });
    expect(out).toEqual([
      { json: { email_id: "e", filename: "a.pdf", start_attachment_batch: true }, pairedItem: { item: 0 } },
      { json: { email_id: "e", filename: "b.pdf", start_attachment_batch: true }, pairedItem: { item: 0 } },
    ]);
  });

  const loop = { "Loop Attachments": { json: { email_id: "e", filename: "a.pdf" } }, "Retry Loop": { json: { attempt: 2, max_attempts: 6 } } };
  const found = (...names: string[]): Item[] => (names.length ? names.map((name, i) => ({ json: { id: `f${i}`, name } })) : [{ json: {} }]);

  it.each(["Validate Attachment Match", "Validate Attachment Match (Retry)"])("%s accepts exactly one Drive file with the same name", async (name) => {
    const run = node(name);
    expect(await run(found("a.pdf"), loop)).toEqual([{ json: { email_id: "e", filename: "a.pdf", source_file_id: "f0" }, pairedItem: { item: 0 } }]);
    await expect(run(found("a.pdf", "a.pdf"), loop)).rejects.toThrow("Attachment filename is ambiguous in the Drive folder.");
    await expect(run(found("b.pdf"), loop)).rejects.toThrow("Drive returned a different attachment filename.");
    await expect(run(found(), loop)).rejects.toThrow("Attachment not found in the Drive folder");
  });

  it("the retry says which attempt failed", async () => {
    await expect(node("Validate Attachment Match (Retry)")(found(), loop)).rejects.toThrow("(retry 2 of 6)");
  });

  it("Build Retry Attempts retries a missing file six times and rethrows anything else", async () => {
    const run = node("Build Retry Attempts");
    const out = await run({ json: { error: { message: "Attachment not found in the Drive folder." } } });
    expect(out.map((o: { json: { attempt: number } }) => o.json.attempt)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out[0].json).toEqual({ attempt: 1, max_attempts: 6, start_retry_batch: true });
    await expect(run({ json: { error: "Drive returned a different attachment filename." } })).rejects.toThrow("Drive returned a different attachment filename.");
    await expect(run({ json: {} })).rejects.toThrow("Attachment processing failed");
  });

  it("Prepare Attachment Error sends the email to review with the reason", async () => {
    const out = await node("Prepare Attachment Error")({ json: { error: { message: "x".repeat(2500) } } }, {
      "Loop Attachments": { json: { email_id: "e", filename: "a.pdf" } },
      "Prepare Email Log": { json: { firestore_document: { fields: { human_review_reasons: { arrayValue: { values: [{ stringValue: "earlier" }] } } } } } },
    });
    const f = out.json.firestore_document.fields;
    expect(out.json.email_id).toBe("e");
    expect(f.status).toEqual({ stringValue: "needs_review" });
    expect(f.human_review_required).toEqual({ booleanValue: true });
    expect(f.human_review_reasons.arrayValue.values.map((v: { stringValue: string }) => v.stringValue)).toEqual(["earlier", `Attachment a.pdf could not be processed: ${"x".repeat(2000)}`]);
    expect(f.last_ingestion_error.mapValue.fields.filename).toEqual({ stringValue: "a.pdf" });
  });

  it("Unsupported Attachment names the formats it can read", async () => {
    await expect(node("Unsupported Attachment")({ json: {} })).rejects.toThrow("Unsupported attachment format. Use an image, TXT, PDF, XLSX or DOCX");
  });
});
