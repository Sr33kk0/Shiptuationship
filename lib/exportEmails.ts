import { FIELDS, FIRESTORE_KEYS, type Fields, type Shipment } from "./shipments";

const fields = (value: Fields | null) => value && Object.fromEntries(FIELDS.map(({ key }) => [FIRESTORE_KEYS[key], value[key]]));

export function emailExportRecord(s: Shipment) {
  // Manual verification supersedes the original automatic comparison.
  const defects = s.reviewedAt && s.referenceFields && s.extractedFields
    ? FIELDS.filter(({ key }) => s.referenceFields![key] !== s.extractedFields![key]).map(({ key, label }) => ({
        field: FIRESTORE_KEYS[key], label, si: s.referenceFields![key], bl: s.extractedFields![key],
      }))
    : s.discrepancies.map(({ field, ...detail }) => ({ field: FIRESTORE_KEYS[field], ...detail }));
  return {
    category: s.category.replaceAll("-", "_").toUpperCase(),
    status: s.status === "clean" ? "OK" : s.status === "discrepancy" ? "NEEDS_REVIEW" : "PENDING",
    review_reason: s.reviewReasons.length ? s.reviewReasons.join("\n") : null,
    defect_fields: defects.map((d) => d.field),
    has_defect: defects.length > 0,
    subject: s.subject,
    sender_email: s.sender,
    sender_name: s.senderName,
    classified_at: s.at || null,
    date: s.rawDate,
    email_body: s.emailBody,
    review_reasons: s.reviewReasons,
    reviewed_by: s.reviewedBy || null,
    reviewed_at: s.reviewedAt || null,
    is_read: s.isRead,
    marked_read_by: s.markedReadBy || null,
    marked_read_at: s.markedReadAt || null,
    attachment_count: s.attachmentCount,
    attachment_names: s.attachmentNames,
    attachment_links: s.attachmentLinks,
    si_reference: s.siRef || null,
    bl_reference: s.blRef || null,
    si_fields: fields(s.referenceFields),
    bl_fields: fields(s.extractedFields),
    discrepancies: defects,
    audit_trail: s.auditTrail,
  };
}

function csvCell(value: unknown) {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Keep email content from being interpreted as spreadsheet formulas.
  if (/^\s*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeEmails(rows: Shipment[], format: "csv" | "json") {
  const records = rows.map((s) => ({ email_id: s.id, ...emailExportRecord(s) }));
  if (format === "json") return JSON.stringify(Object.fromEntries(records.map(({ email_id, ...record }) => [email_id, record])), null, 2);
  if (!records.length) return "";
  return "\uFEFF" + [Object.keys(records[0]), ...records.map(Object.values)].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
