import { describe, expect, it } from "vitest";
import { countByCountry, countryName, portCountry, portName, voyageLegs } from "@/lib/ports";
import { fields, shipment } from "@/test/fixtures";

describe("portCountry", () => {
  it("uses the UN/LOCODE in brackets", () => {
    expect(portCountry("NANTONG, CHINA (CNNTG)")).toBe("CN");
    expect(portCountry("somewhere (sgsin)")).toBe("SG");
  });

  it("falls back to the country after the last comma when the code is not a real country", () => {
    expect(portCountry("Tokyo, Japan (XXABC)")).toBe("JP");
  });

  it("uses the country name after the last comma", () => {
    expect(portCountry("Rotterdam, Netherlands")).toBe("NL");
    expect(portCountry("Port Klang, Selangor, Malaysia")).toBe("MY");
  });

  it("uses the whole text when there is no comma", () => {
    expect(portCountry("SINGAPORE")).toBe("SG");
  });

  it("knows shipping spellings the browser does not", () => {
    expect(portCountry("Busan, South Korea")).toBe("KR");
    expect(portCountry("Felixstowe, UK")).toBe("GB");
    expect(portCountry("Jebel Ali, UAE")).toBe("AE");
    expect(portCountry("Ho Chi Minh, Vietnam")).toBe("VN");
    expect(portCountry("Long Beach, USA")).toBe("US");
  });

  it("ignores accents, punctuation and case", () => {
    expect(portCountry("Willemstad, Curaçao")).toBe("CW");
    expect(portCountry("Abidjan, côte d'ivoire")).toBe("CI");
  });

  it("returns null for blank or unknown ports", () => {
    expect(portCountry(null)).toBeNull();
    expect(portCountry(undefined)).toBeNull();
    expect(portCountry("   ")).toBeNull();
    expect(portCountry("Atlantis")).toBeNull();
  });
});

describe("countryName", () => {
  it("names a country code", () => {
    expect(countryName("SG")).toBe("Singapore");
  });
});

describe("countByCountry", () => {
  it("counts per country, biggest first, ties by code", () => {
    const result = countByCountry(["Rotterdam, Netherlands", "SINGAPORE", "Tokyo, Japan", "Singapore", "Atlantis", "", null]);
    expect(result.rows).toEqual([
      { code: "SG", count: 2 },
      { code: "JP", count: 1 },
      { code: "NL", count: 1 },
    ]);
    expect(result.placed).toBe(4);
    expect(result.unplaced).toBe(1);
  });

  it("handles no ports", () => {
    expect(countByCountry([])).toEqual({ rows: [], placed: 0, unplaced: 0 });
  });
});

describe("portName", () => {
  it("drops the country and the UN/LOCODE", () => {
    expect(portName("JAWAHARLAL NEHRU (NHAVA SHEVA), INDIA (INNSA)")).toBe("JAWAHARLAL NEHRU (NHAVA SHEVA)");
    expect(portName("SGSIN")).toBe("SGSIN");
  });
});

describe("voyageLegs", () => {
  it("lists one leg per distinct POL -> POD, from validated comparisons and other emails only", () => {
    expect(voyageLegs([
      shipment({ id: "email_001" }),
      shipment({ id: "email_002", extractedFields: fields({ pol: " PORT KLANG, MALAYSIA (MYPKG) ", pod: "ROTTERDAM, NETHERLANDS (NLRTM)" }) }),
      shipment({ id: "email_003", status: "discrepancy", extractedFields: fields({ pol: "Busan, South Korea (KRPUS)" }) }),
      shipment({ id: "email_004", status: "pending", extractedFields: fields({ pol: "Busan, South Korea (KRPUS)" }) }),
      shipment({ id: "email_005", category: "new-si", status: "pending", extractedFields: null, referenceFields: fields({ pod: "Long Beach, USA (USLGB)" }) }),
      shipment({ id: "email_006", extractedFields: fields({ pod: " " }) }),
      shipment({ id: "email_007", category: "general", extractedFields: null, referenceFields: null }),
    ])).toEqual([
      { pol: "Port Klang, Malaysia (MYPKG)", pod: "Rotterdam, Netherlands (NLRTM)", emails: ["email_001", "email_002"] },
      { pol: "Port Klang, Malaysia (MYPKG)", pod: "Long Beach, USA (USLGB)", emails: ["email_005"] },
    ]);
  });
});
