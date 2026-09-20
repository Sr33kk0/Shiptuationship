export interface Top {
  name: string;
  count: number;
}

// Top `n` most frequent values. Matching ignores case and extra spaces; the most common spelling is shown.
// Ties are broken alphabetically so the ranking is stable between refreshes. `total` = non-empty values counted.
export function topN(values: (string | null | undefined)[], n = 3): { items: Top[]; total: number } {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  let total = 0;
  for (const raw of values) {
    const name = (raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    total++;
    const g = groups.get(name.toUpperCase()) ?? { count: 0, spellings: new Map() };
    g.count++;
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1);
    groups.set(name.toUpperCase(), g);
  }
  const items = [...groups.values()].map((g) => ({ name: [...g.spellings].sort((a, b) => b[1] - a[1])[0][0], count: g.count }));
  items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { items: items.slice(0, n), total };
}
