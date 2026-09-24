// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { geocode, seaRoute } from "@/lib/seaRoutes";
import { GET, dynamic } from "@/app/api/sea-routes/route";

vi.mock("@/lib/seaRoutes", () => ({ geocode: vi.fn(), seaRoute: vi.fn() }));
const places: Record<string, [number, number]> = { "NANTONG, CHINA (CNNTG)": [120.89, 31.98], "GDANSK, POLAND (PLGDN)": [18.65, 54.35] };
const get = (query: string) => GET(new Request(`http://localhost/api/sea-routes?${query}`));

beforeEach(() => {
  vi.mocked(geocode).mockReset().mockImplementation(async (raw) => places[raw] ?? null);
  vi.mocked(seaRoute).mockReset().mockResolvedValue({ path: [[120.89, 31.98], [18.65, 54.35]], nm: 11589 });
});

describe("GET /api/sea-routes", () => {
  it("is never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("answers each leg in order, with null for ports no map knows", async () => {
    const res = await get(new URLSearchParams([["from", "NANTONG, CHINA (CNNTG)"], ["to", "GDANSK, POLAND (PLGDN)"], ["from", "Atlantis"], ["to", "GDANSK, POLAND (PLGDN)"]]).toString());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { from: [120.89, 31.98], to: [18.65, 54.35], path: [[120.89, 31.98], [18.65, 54.35]], nm: 11589 },
      { from: null, to: [18.65, 54.35], path: null, nm: null },
    ]);
    expect(seaRoute).toHaveBeenCalledTimes(1);
  });

  it("refuses unmatched, empty, too many or too long ports", async () => {
    for (const query of ["", "from=A", "from=A&to=", `from=A&to=${"x".repeat(201)}`, "from=A&to=B&".repeat(21)]) {
      expect((await get(query)).status).toBe(400);
    }
    expect(geocode).not.toHaveBeenCalled();
  });

  it("reports a geocoding or network failure as 502", async () => {
    vi.mocked(geocode).mockRejectedValue(new Error("Geocoding failed (503)"));
    const res = await get("from=A&to=B");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Geocoding failed (503)" });
  });
});
