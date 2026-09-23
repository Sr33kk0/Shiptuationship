import { afterEach, describe, expect, it } from "vitest";
import { fields, shipment } from "@/test/fixtures";
import { CATS, FIELDS, FIRESTORE_KEYS, dayKey, fmtDate, fmtTime, fmtWhen, mismatches } from "@/lib/shipments";

describe("field tables", () => {
  it("maps every compared field to its Firestore name", () => {
    expect(FIELDS).toHaveLength(7);
    expect(Object.keys(FIRESTORE_KEYS).sort()).toEqual(FIELDS.map((f) => f.key).sort());
  });

  it("has a label and colours for every category", () => {
    expect(Object.keys(CATS)).toEqual(["document-comparison", "new-si", "invoice", "general", "spam"]);
    for (const c of Object.values(CATS)) expect(c.label && c.color && c.bg).toBeTruthy();
  });
});

describe("mismatches", () => {
  it("lists the fields that differ, in field order", () => {
    expect(mismatches(fields({ grossWeightKg: "1", shipper: "X" }), fields())).toEqual(["shipper", "grossWeightKg"]);
  });

  it("is empty when both sides agree", () => {
    expect(mismatches(fields(), fields())).toEqual([]);
  });
});

describe("date formatting", () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  it("formats the classification time", () => {
    const s = shipment({ at: "2026-03-05T20:36:00.000Z" });
    expect(dayKey(s)).toBe("2026-03-05");
    expect(fmtDate(s)).toBe("05/03/26");
    expect(fmtTime(s)).toBe("20:36");
    expect(fmtWhen(s)).toBe("05/03/26 20:36");
  });

  it("uses the viewer's time zone for the calendar day", () => {
    process.env.TZ = "Asia/Kuala_Lumpur";
    const s = shipment({ at: "2026-03-05T20:36:00.000Z" });
    expect(dayKey(s)).toBe("2026-03-06");
    expect(fmtWhen(s)).toBe("06/03/26 04:36");
  });

  it("falls back to the stored date when there is no timestamp", () => {
    const s = shipment({ at: "", rawDate: "2026-01-02", date: "02 Jan 2026" });
    expect(dayKey(s)).toBe("2026-01-02");
    expect(fmtDate(s)).toBe("02 Jan 2026");
    expect(fmtTime(s)).toBe("");
    expect(fmtWhen(s)).toBe("02 Jan 2026");
  });
});
