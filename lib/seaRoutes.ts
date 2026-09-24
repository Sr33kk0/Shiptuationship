// Server-only: where a port is (geocoded with OpenStreetMap's Nominatim) and the shortest sea route between two ports
// (Dijkstra over MARNET, Eurostat's network of shipping lanes, as packaged by searoute-js and read from its CDN copy).

export type Pt = [lng: number, lat: number];

const MARNET = "https://cdn.jsdelivr.net/npm/searoute-js@0.1.0/data/marnet_densified.json";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Shiptuationship/1.0 (port geocoding for the voyage globe)"; // Nominatim's usage policy asks each app to name itself

/** Great-circle distance in km. */
export function km([lng1, lat1]: Pt, [lng2, lat2]: Pt) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---- geocoding ------------------------------------------------------------------------------------------

/** "JAWAHARLAL NEHRU (NHAVA SHEVA), INDIA (INNSA)" → ["NHAVA SHEVA, INDIA", "JAWAHARLAL NEHRU, INDIA"]. The name in brackets goes
 *  first: it is usually the one a map knows ("JAWAHARLAL NEHRU" alone finds a statue in Chennai). "A/B/C" tries each name. */
export function geocodeQueries(raw: string) {
  const parts = raw.replace(/\s*\([A-Z0-9]{5}\)\s*$/i, "").split(",").map((p) => p.trim()).filter(Boolean);
  const country = parts.length > 1 ? `, ${parts[parts.length - 1].replace(/\s*\(.*\)/, "")}` : "";
  const place = parts[0] ?? "";
  const names = [...place.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).concat(place.replace(/\s*\([^)]*\)/g, "").split("/"));
  return [...new Set(names.map((n) => n.trim()).filter(Boolean).map((n) => n + country))];
}

// Nominatim allows one request a second, so every lookup waits its turn; answers are kept, so each port is looked up once.
// ponytail: in-memory cache, a restart looks every port up again; store positions in Firestore if that load ever matters.
const places = new Map<string, Promise<Pt | null>>();
let queue: Promise<unknown> = Promise.resolve();
const pause = () => new Promise((r) => setTimeout(r, 1000));
function politely<T>(request: () => Promise<T>): Promise<T> {
  const run = queue.then(request);
  queue = run.then(pause, pause);
  return run;
}

/** Where a port is, or null when no map knows the name. */
export function geocode(raw: string): Promise<Pt | null> {
  const key = raw.trim().toUpperCase();
  let found = places.get(key);
  if (!found) {
    found = (async () => {
      for (const q of geocodeQueries(key)) {
        const res = await politely(() => fetch(`${NOMINATIM}?${new URLSearchParams({ q, format: "jsonv2", limit: "1" })}`, { headers: { "User-Agent": USER_AGENT } }));
        if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
        const [hit] = (await res.json()) as { lat: string; lon: string }[];
        if (hit) return [Number(hit.lon), Number(hit.lat)] as Pt;
      }
      return null;
    })();
    places.set(key, found);
    found.catch(() => places.delete(key)); // a failed lookup is retried next time; "not found" is kept
  }
  return found;
}

// ---- sea routes ------------------------------------------------------------------------------------------

interface Graph {
  at: Pt[]; // node positions
  next: [node: number, km: number][][]; // each node's neighbours
}

// One node per lane vertex; lanes meet where they share a vertex. Longitude 180 is folded onto -180 so Pacific lanes join up.
export function buildGraph(lanes: Pt[][]): Graph {
  const ids = new Map<string, number>();
  const g: Graph = { at: [], next: [] };
  const node = ([lng, lat]: Pt) => {
    const p: Pt = [lng === 180 ? -180 : lng, lat];
    let i = ids.get(`${p}`);
    if (i === undefined) {
      ids.set(`${p}`, (i = g.at.length));
      g.at.push(p);
      g.next.push([]);
    }
    return i;
  };
  for (const lane of lanes) {
    for (let j = 1; j < lane.length; j++) {
      const [a, b] = [node(lane[j - 1]), node(lane[j])];
      const d = km(g.at[a], g.at[b]);
      g.next[a].push([b, d]);
      g.next[b].push([a, d]);
    }
  }
  return g;
}

let network: Promise<Graph> | null = null;
function loadNetwork() {
  network ??= fetch(MARNET)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load the shipping lanes (${r.status})`))))
    .then((fc: { features: { geometry: { coordinates: Pt[] } }[] }) => buildGraph(fc.features.map((f) => f.geometry.coordinates)));
  network.catch(() => (network = null)); // try again on the next request
  return network;
}

/** Shortest path from any `start` node to any `end` node (Dijkstra with a binary heap), as node ids; null when none connect.
 *  Each map holds node -> km already travelled to reach it (start) or still to go from it (end). */
export function shortest(g: Graph, start: Map<number, number>, end: Map<number, number>): number[] | null {
  const T = g.at.length; // a virtual last stop, reached from every `end` node
  const dist = new Float64Array(T + 1).fill(Infinity);
  const prev = new Int32Array(T + 1).fill(-1);
  const heap: [number, number][] = [];
  const swap = (i: number, j: number) => ([heap[i], heap[j]] = [heap[j], heap[i]]);
  const push = (d: number, v: number) => {
    heap.push([d, v]);
    for (let i = heap.length - 1; i > 0 && heap[(i - 1) >> 1][0] > heap[i][0]; i = (i - 1) >> 1) swap(i, (i - 1) >> 1);
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (!heap.length) return top;
    heap[0] = last;
    for (let i = 0; ; ) {
      const [l, r] = [2 * i + 1, 2 * i + 2];
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) return top;
      swap(i, m);
      i = m;
    }
  };
  for (const [s, d] of start) {
    dist[s] = d;
    push(d, s);
  }
  while (heap.length) {
    const [d, u] = pop();
    if (u === T) break;
    if (d > dist[u]) continue;
    const out = end.has(u) ? [...g.next[u], [T, end.get(u)!] as [number, number]] : g.next[u];
    for (const [v, w] of out) {
      if (d + w >= dist[v]) continue;
      dist[v] = d + w;
      prev[v] = u;
      push(d + w, v);
    }
  }
  if (dist[T] === Infinity) return null;
  const path = [];
  for (let u = prev[T]; u !== -1; u = prev[u]) path.push(u);
  return path.reverse();
}

// Where a port joins the lanes: every vertex within 150 km of its nearest one, so the search takes whichever is shortest
// overall rather than just the closest (Nantong's closest lane heads north, away from the Yangtze mouth).
// ponytail: linear scan of the ~6k vertices per port; add a spatial index if a page ever routes hundreds of ports.
function entries(g: Graph, p: Pt) {
  const d = g.at.map((q) => km(p, q));
  const reach = Math.min(...d) + 150;
  return new Map(d.flatMap((x, i) => (x <= reach ? [[i, x] as [number, number]] : [])));
}

/** The sea route from one port to another, joined to the lanes as above, with its length in nautical miles. */
export async function seaRoute(from: Pt, to: Pt): Promise<{ path: Pt[]; nm: number } | null> {
  const g = await loadNetwork();
  const nodes = shortest(g, entries(g, from), entries(g, to));
  if (!nodes) return null;
  const path = [from, ...nodes.map((i) => g.at[i]), to];
  const total = path.reduce((sum, p, i) => (i ? sum + km(path[i - 1], p) : 0), 0);
  return { path, nm: Math.round(total / 1.852) };
}
