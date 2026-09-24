// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGraph, geocode, geocodeQueries, km, seaRoute, shortest, type Pt } from "@/lib/seaRoutes";

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });

describe("geocodeQueries", () => {
  it("tries the name in brackets first, then the main name and each of A/B/C, all with the country", () => {
    expect(geocodeQueries("JAWAHARLAL NEHRU (NHAVA SHEVA), INDIA (INNSA)")).toEqual(["NHAVA SHEVA, INDIA", "JAWAHARLAL NEHRU, INDIA"]);
    expect(geocodeQueries("RUGAO/NANTONG/SHANGHAI, CHINA (CNSHA)")).toEqual(["RUGAO, CHINA", "NANTONG, CHINA", "SHANGHAI, CHINA"]);
    expect(geocodeQueries("YANGON, MYANMAR (BURMA) (MMRGN)")).toEqual(["YANGON, MYANMAR"]);
    expect(geocodeQueries("SINGAPORE")).toEqual(["SINGAPORE"]);
  });
});

describe("shortest", () => {
  // ids in order of first appearance: [0,0]=0 [1,0]=1 [2,0]=2 [0,5]=3 [2,5]=4 [170,0]=5 [-180,0]=6 [-170,0]=7
  const g = buildGraph([
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [0, 5], [2, 5], [2, 0]],
    [[170, 0], [180, 0]],
    [[-180, 0], [-170, 0]],
  ]);

  it("takes the shorter way round", () => {
    expect(shortest(g, new Map([[0, 0]]), new Map([[2, 0]]))).toEqual([0, 1, 2]);
  });

  it("counts the distance to reach each entry, not just the lanes", () => {
    expect(shortest(g, new Map([[3, 0], [0, 50]]), new Map([[2, 0]]))).toEqual([0, 1, 2]);
    expect(shortest(g, new Map([[3, 0], [0, 5000]]), new Map([[2, 0]]))).toEqual([3, 4, 2]);
  });

  it("joins lanes across the 180th meridian, and says when nothing connects", () => {
    expect(shortest(g, new Map([[5, 0]]), new Map([[7, 0]]))).toEqual([5, 6, 7]);
    expect(shortest(g, new Map([[0, 0]]), new Map([[7, 0]]))).toBeNull();
  });
});

describe("geocode", () => {
  it("tries each query in turn, one request a second, and remembers the answer", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => json(url.includes("NHAVA") ? [] : [{ lat: "18.95", lon: "72.95" }]));
    vi.stubGlobal("fetch", fetch);
    const found = geocode("Jawaharlal Nehru (Nhava Sheva), India (INNSA)");
    await vi.runAllTimersAsync();
    expect(await found).toEqual([72.95, 18.95]);
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("q"))).toEqual(["NHAVA SHEVA, INDIA", "JAWAHARLAL NEHRU, INDIA"]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { "User-Agent": expect.stringContaining("Shiptuationship") } });
    expect(await geocode(" JAWAHARLAL NEHRU (NHAVA SHEVA), INDIA (INNSA)")).toEqual([72.95, 18.95]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps 'not found' but retries after a failed request", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => json([], false));
    vi.stubGlobal("fetch", fetch);
    const failed = geocode("Atlantis, Ocean").catch((e: Error) => e.message);
    await vi.runAllTimersAsync();
    expect(await failed).toBe("Geocoding failed (503)");
    fetch.mockImplementation(async () => json([]));
    const missing = geocode("Atlantis, Ocean");
    await vi.runAllTimersAsync();
    expect(await missing).toBeNull();
    expect(await geocode("Atlantis, Ocean")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("seaRoute", () => {
  const lanes = { features: [{ geometry: { coordinates: [[0, 0], [5, 0], [10, 0]] } }] };

  it("loads the lanes once, retrying after a failure, and joins each port to its nearest lane", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(null, false)));
    await expect(seaRoute([0, -0.5], [10, 0.5])).rejects.toThrow("Could not load the shipping lanes (503)");

    const fetch = vi.fn(async () => json(lanes));
    vi.stubGlobal("fetch", fetch);
    const route = await seaRoute([0, -0.5], [10, 0.5]);
    const path: Pt[] = [[0, -0.5], [0, 0], [5, 0], [10, 0], [10, 0.5]];
    expect(route).toEqual({ path, nm: Math.round(path.reduce((sum, p, i) => (i ? sum + km(path[i - 1], p) : 0), 0) / 1.852) });
    await seaRoute([10, 0.5], [0, -0.5]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
