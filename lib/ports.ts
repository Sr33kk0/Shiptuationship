import type { Shipment } from "./shipments";

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

// ---- a voyage's legs, for the globe ----------------------------------------------------------------------

export interface Leg {
  pol: string; // the ports as the documents write them: "NANTONG, CHINA (CNNTG)"
  pod: string;
  emails: string[]; // ids of the emails that name this leg
}

/** A leg's id, the same however its ports are capitalised or padded. */
export const legKey = (l: Pick<Leg, "pol" | "pod">) => `${l.pol}>${l.pod}`.toUpperCase();

// One colour per leg, the same on the globe, in its list and on the email filter: the dashboard's series colours first
// (TopBars, CategoryChart), then more. ponytail: colours repeat after 8 legs; no voyage has more than 2 today.
const LEG_COLORS = ["#60a5fa", "#c084fc", "#fbbf24", "#fb7185", "#34d399", "#f97316", "#2dd4bf", "#a3e635"];
export const legColor = (i: number) => LEG_COLORS[i % LEG_COLORS.length];

// The legs a voyage sails, one per distinct port of loading -> port of discharge. Comparisons count only once validated
// (their ports are then confirmed on both the SI and the BL); other emails count whenever they carry both ports.
export function voyageLegs(emails: Shipment[]): Leg[] {
  const legs = new Map<string, Leg>();
  for (const s of emails) {
    if (s.category === "document-comparison" && s.status !== "clean") continue;
    const f = s.extractedFields ?? s.referenceFields;
    const [pol, pod] = [f?.pol.trim(), f?.pod.trim()];
    if (!pol || !pod) continue;
    const key = legKey({ pol, pod });
    const leg = legs.get(key) ?? { pol, pod, emails: [] };
    leg.emails.push(s.id);
    legs.set(key, leg);
  }
  return [...legs.values()];
}

/** "JAWAHARLAL NEHRU (NHAVA SHEVA), INDIA (INNSA)" → "JAWAHARLAL NEHRU (NHAVA SHEVA)": the port without its country or code. */
export const portName = (raw: string) => raw.split(",")[0].replace(/\s*\([A-Z0-9]{5}\)\s*$/i, "").trim();
