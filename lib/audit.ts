// Shared (client-safe) shape of one entry in the audit log. Built on the server in lib/firestore.ts from Firestore data only.
export type AuditKind = "classified" | "compared" | "review_saved" | "cleared" | "marked_read";

export interface AuditEvent {
  id: string;
  at: string; // ISO timestamp
  kind: AuditKind;
  actor: string; // display name of the person; for the automation (bot) show BOT_NAME instead
  bot: boolean; // true = the automation rather than a person
  emailId: string;
  subject: string;
  detail: string; // classification name / comparison status / "BL" or "SI" for a review / ""
  outcome: string; // review result: "cleared" | "flagged" (incl. needs_review) | ""
  changes: { field: string; before: string; after: string }[];
  facts?: { label: string; value: string; href?: string }[]; // system events: context shown when the entry is expanded
  fields?: ComparedField[]; // "compared" only: how each of the seven fields was compared
}

// One document's side of a compared field: the value read off the document, then the value the comparison used.
// `normalized` is "" when both documents were identical, so nothing needed normalising. `note` is the port check's verdict on ports.
export interface ComparedSide { document: string; normalized: string; note: string; ok: boolean }
export interface ComparedField { field: string; result: "match" | "formatting" | "mismatch"; si: ComparedSide; bl: ComparedSide }

export const KINDS: Record<AuditKind, { label: string; color: string; icon: "doc" | "check" | "search" | "filter" }> = {
  classified: { label: "Classified", color: "#7e22ce", icon: "filter" },
  compared: { label: "Auto-comparison", color: "#1d4ed8", icon: "search" },
  review_saved: { label: "Review saved", color: "#059669", icon: "check" },
  cleared: { label: "Cleared", color: "#0d9488", icon: "check" },
  marked_read: { label: "Marked read", color: "#d97706", icon: "doc" },
};

// How the automation is named on screen.
export const BOT_NAME = "Ship AI";

// The two logs: what people did, and what the automation did on its own. Each has its own page and its own action filter.
export type AuditSource = "user" | "system";
export const SOURCES: Record<AuditSource, { title: string; blurb: string; kinds: AuditKind[] }> = {
  user: { title: "User Log", blurb: "Actions taken by moderators, newest first.", kinds: ["review_saved", "cleared", "marked_read"] },
  system: { title: "System Log", blurb: "What Ship AI did automatically, newest first.", kinds: ["classified", "compared"] },
};
