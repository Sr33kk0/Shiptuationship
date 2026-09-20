// Turns a port string such as "NANTONG, CHINA (CNNTG)" into an ISO country code for the map.
// Uses the UN/LOCODE in brackets when there is one (its first two letters are the country), otherwise the
// country name after the last comma, otherwise the whole text ("SINGAPORE").

const regions = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }) : null;

// Spellings that shipping documents use but the browser's own country names don't.
const ALIASES: Record<string, string> = {
  US: "US", USA: "US", "UNITED STATES OF AMERICA": "US", UAE: "AE", UK: "GB", "GREAT BRITAIN": "GB", ENGLAND: "GB",
  "SOUTH KOREA": "KR", KOREA: "KR", "REPUBLIC OF KOREA": "KR", TURKEY: "TR", TURKIYE: "TR", MYANMAR: "MM", BURMA: "MM",
  VIETNAM: "VN", "VIET NAM": "VN", RUSSIA: "RU", "IVORY COAST": "CI", "HONG KONG": "HK", "CZECH REPUBLIC": "CZ", TAIWAN: "TW",
};

const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

let byName: Map<string, string> | null = null;
function nameToCode(name: string): string | null {
  if (!byName) {
    // ask the browser for the name of every two-letter code once, and flip that into name -> code
    byName = new Map();
    if (regions) {
      for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const n = regions.of(code);
          if (n) byName.set(clean(n), code);
        }
      }
    }
    for (const [k, v] of Object.entries(ALIASES)) byName.set(k, v);
  }
  return byName.get(clean(name)) ?? null;
}

export function portCountry(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const code = v.match(/\(([A-Za-z]{2})[A-Za-z0-9]{3}\)\s*$/)?.[1].toUpperCase();
  if (code && regions?.of(code)) return code;
  const parts = v.replace(/\s*\([^)]*\)\s*$/, "").split(",").map((p) => p.trim()).filter(Boolean);
  return nameToCode(parts[parts.length - 1] ?? "");
}

export const countryName = (code: string) => regions?.of(code) ?? code;

export interface CountryCount {
  code: string;
  count: number;
}

// Shipments per country, biggest first (ties by code so the order is stable). `unplaced` = ports we couldn't tie to a country.
export function countByCountry(values: (string | null | undefined)[]) {
  const m = new Map<string, number>();
  let placed = 0;
  let unplaced = 0;
  for (const v of values) {
    if (!v?.trim()) continue;
    const c = portCountry(v);
    if (c) {
      m.set(c, (m.get(c) ?? 0) + 1);
      placed++;
    } else unplaced++;
  }
  const rows: CountryCount[] = [...m].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { rows, placed, unplaced };
}
