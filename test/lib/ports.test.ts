import { describe, expect, it } from "vitest";
import { countByCountry, countryName, portCountry } from "@/lib/ports";

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
