// Shared (client-safe) shape of one entry in the audit log. Built on the server in lib/firestore.ts from Firestore data only.
export type AuditKind = "classified" | "compared" | "review_saved" | "marked_read";

export interface AuditEvent {
  id: string;
  at: string; // ISO timestamp
  kind: AuditKind;
  actor: string; // display name, or "n8n Workflow" for the automation
  bot: boolean; // true = the n8n automation rather than a person
  emailId: string;
  subject: string;
  detail: string; // classification name / comparison status / "BL" or "SI" for a review / ""
  outcome: string; // review result: "cleared" | "flagged" (incl. needs_review) | ""
  changes: { field: string; before: string; after: string }[];
}

export const KINDS: Record<AuditKind, { label: string; color: string; icon: "doc" | "check" | "search" | "filter" }> = {
  classified: { label: "Classified", color: "#7e22ce", icon: "filter" },
  compared: { label: "Auto-comparison", color: "#1d4ed8", icon: "search" },
  review_saved: { label: "Review saved", color: "#059669", icon: "check" },
  marked_read: { label: "Marked read", color: "#d97706", icon: "doc" },
};

// The two logs: what people did, and what the n8n workflow did on its own. Each has its own page and its own action filter.
export type AuditSource = "user" | "system";
export const SOURCES: Record<AuditSource, { title: string; blurb: string; kinds: AuditKind[] }> = {
  user: { title: "User Log", blurb: "Actions taken by moderators, newest first.", kinds: ["review_saved", "marked_read"] },
  system: { title: "System Log", blurb: "What the n8n workflow did automatically, newest first.", kinds: ["classified", "compared"] },
};
