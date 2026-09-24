import { describe, expect, it } from "vitest";
import { BOT_NAME, KINDS, SOURCES, type AuditKind } from "@/lib/audit";

describe("audit log tables", () => {
  it("splits every kind between the user and system logs exactly once", () => {
    const all = [...SOURCES.user.kinds, ...SOURCES.system.kinds].sort();
    expect(all).toEqual((Object.keys(KINDS) as AuditKind[]).sort());
  });

  it("puts moderator actions in the user log and automation in the system log", () => {
    expect(SOURCES.user.kinds).toEqual(["review_saved", "cleared", "marked_read"]);
    expect(SOURCES.system.kinds).toEqual(["classified", "compared"]);
  });

  it("names the automation in the system log blurb", () => {
    expect(SOURCES.system.blurb).toContain(BOT_NAME);
  });
});
