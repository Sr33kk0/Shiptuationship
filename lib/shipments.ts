export type Category = "document-comparison" | "new-si" | "invoice" | "general" | "other";
export type Status = "discrepancy" | "clean" | "pending";

// The 7 manifest fields compared between the customer SI and the carrier's draft BL.
export const FIELDS = [
  { key: "shipper", label: "Shipper" },
  { key: "consignee", label: "Consignee" },
  { key: "notifyParty", label: "Notify Party" },
  { key: "pol", label: "Port of Loading (POL)" },
  { key: "pod", label: "Port of Discharge (POD)" },
  { key: "containerCount", label: "Container Count", unit: " units" },
  { key: "grossWeightKg", label: "Gross Weight (kg)", unit: " kg" },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
export type Fields = Record<FieldKey, string>;

// Field names as n8n writes them into the Firestore `bl` / `si` maps.
export const FIRESTORE_KEYS: Record<FieldKey, string> = {
  shipper: "shipper",
  consignee: "consignee",
  notifyParty: "notify_party",
  pol: "port_of_loading",
  pod: "port_of_discharge",
  containerCount: "container_count",
  grossWeightKg: "gross_weight_kg",
};

export interface Shipment {
  id: string;
  subject: string;
  sender: string;
  senderName: string;
  category: Category;
  date: string;
  rawDate: string;
  status: Status;
  reviewedBy: string;
  reviewedAt: string;
  isRead: boolean;
  markedReadBy: string;
  markedReadAt: string;
  attachmentCount: number;
  attachmentNames: string[];
  emailBody: string;
  siRef?: string;
  blRef?: string;
  extractedFields: Fields | null;
  referenceFields: Fields | null;
  discrepancies: { field: FieldKey; label: string; si: string; bl: string; note: string }[];
  auditTrail: { time: string; action: string }[];
}

export const CATS: Record<Category, { label: string; color: string; bg: string }> = {
  "document-comparison": { label: "SI BL Comparison", color: "#1d4ed8", bg: "#eff6ff" },
  "new-si": { label: "SI Request", color: "#7e22ce", bg: "#faf5ff" },
  invoice: { label: "Invoice", color: "#b45309", bg: "#fffbeb" },
  general: { label: "General", color: "#404040", bg: "#f5f5f5" },
  other: { label: "Other", color: "#be123c", bg: "#fff1f2" },
};

export const mismatches = (a: Fields, b: Fields) => FIELDS.filter((f) => a[f.key] !== b[f.key]).map((f) => f.key);
