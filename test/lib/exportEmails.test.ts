import { describe, expect, it } from "vitest";
import { fields, shipment } from "@/test/fixtures";
import { emailExportRecord, serializeEmails } from "@/lib/exportEmails";

describe("emailExportRecord", () => {
  it("maps category, status and empty values", () => {
    const r = emailExportRecord(shipment({ category: "new-si", status: "pending", reviewedBy: "", siRef: undefined }));
    expect(r.category).toBe("NEW_SI");
    expect(r.status).toBe("PENDING");
    expect(r.reviewed_by).toBeNull();
    expect(r.reviewed_at).toBeNull();
    expect(r.si_reference).toBeNull();
    expect(r.review_reason).toBeNull();
    expect(emailExportRecord(shipment({ status: "clean" })).status).toBe("OK");
    expect(emailExportRecord(shipment({ status: "discrepancy" })).status).toBe("NEEDS_REVIEW");
    expect(emailExportRecord(shipment({ at: "" })).classified_at).toBeNull();
  });

  it("joins review reasons and keeps the list", () => {
    const r = emailExportRecord(shipment({ reviewReasons: ["a", "b"] }));
    expect(r.review_reason).toBe("a\nb");
    expect(r.review_reasons).toEqual(["a", "b"]);
  });

  it("writes both documents under their Firestore field names", () => {
    const r = emailExportRecord(shipment());
    expect(r.si_fields).toMatchObject({ notify_party: "Harbor & Vale Imports Ltd", gross_weight_kg: "22000" });
    expect(emailExportRecord(shipment({ extractedFields: null })).bl_fields).toBeNull();
  });

  it("uses the automatic comparison until someone has reviewed the email", () => {
    const r = emailExportRecord(shipment({
      referenceFields: fields(),
      extractedFields: fields({ containerCount: "4" }),
      discrepancies: [{ field: "pol", label: "Port of Loading (POL)", si: "A", bl: "B", note: "major" }],
    }));
    expect(r.defect_fields).toEqual(["port_of_loading"]);
    expect(r.discrepancies).toEqual([{ field: "port_of_loading", label: "Port of Loading (POL)", si: "A", bl: "B", note: "major" }]);
    expect(r.has_defect).toBe(true);
  });

  it("recomputes defects from the documents once reviewed", () => {
    const r = emailExportRecord(shipment({
      reviewedAt: "2026-03-20T10:00:00Z",
      referenceFields: fields(),
      extractedFields: fields({ containerCount: "4" }),
      discrepancies: [{ field: "pol", label: "Port of Loading (POL)", si: "A", bl: "B", note: "major" }],
    }));
    expect(r.discrepancies).toEqual([{ field: "container_count", label: "Container Count", si: "3", bl: "4" }]);
    expect(r.defect_fields).toEqual(["container_count"]);
  });

  it("reports no defect when the reviewed documents agree", () => {
    const r = emailExportRecord(shipment({ reviewedAt: "2026-03-20T10:00:00Z" }));
    expect(r.has_defect).toBe(false);
    expect(r.defect_fields).toEqual([]);
  });
});

describe("serializeEmails", () => {
  it("writes JSON keyed by email id", () => {
    const parsed = JSON.parse(serializeEmails([shipment({ id: "a" }), shipment({ id: "b" })], "json"));
    expect(Object.keys(parsed)).toEqual(["a", "b"]);
    expect(parsed.a).not.toHaveProperty("email_id");
    expect(parsed.a.subject).toBe("SI and draft BL for review");
  });

  it("writes CSV with a BOM, a header row and CRLF line ends", () => {
    const csv = serializeEmails([shipment({ id: "a" }), shipment({ id: "b" })], "csv");
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('"email_id","category","status"')).toBe(true);
    expect(lines[1].startsWith('"a","DOCUMENT_COMPARISON","OK"')).toBe(true);
  });

  it("escapes quotes, writes objects as JSON and blanks nulls", () => {
    const csv = serializeEmails([shipment({ subject: 'He said "hi"', attachmentNames: ["x.pdf"], reviewedBy: "" })], "csv");
    expect(csv).toContain('"He said ""hi"""');
    expect(csv).toContain('"[""x.pdf""]"');
    expect(csv).toContain(',"",');
  });

  it("neutralises spreadsheet formulas", () => {
    for (const subject of ["=SUM(A1)", "+1", "-1", "@cmd", "  =x", "\tx"]) {
      const csv = serializeEmails([shipment({ subject })], "csv");
      expect(csv).toContain(`"'${subject}"`);
    }
  });

  it("writes nothing for no rows as CSV and an empty object as JSON", () => {
    expect(serializeEmails([], "csv")).toBe("");
    expect(serializeEmails([], "json")).toBe("{}");
  });
});
