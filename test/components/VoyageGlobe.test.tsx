import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { voyageLegs } from "@/lib/ports";
import type { Shipment } from "@/lib/shipments";
import { fields, shipment } from "@/test/fixtures";
import VoyageGlobe from "@/components/VoyageGlobe";

// globe.gl needs WebGL, which jsdom lacks: a chainable stand-in records what the component asks it to draw.
// Like the real instance it is a function, so handing it to setState as-is (which would call it) fails the test.
const g = vi.hoisted(() => {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain: unknown = new Proxy(() => { throw new Error("globe instance called as a function"); }, { get: (_, k: string) => (calls[k] ??= vi.fn(() => chain)) });
  return { calls, chain };
});
vi.mock("globe.gl", () => ({ default: vi.fn(function () { return g.chain; }) }));

const sea = [{ from: [101.39, 3], to: [4.14, 51.95], path: [[101.39, 3], [50, 10], [4.14, 51.95]], nm: 8290 }];
const respond = (routes: unknown, land: unknown = { features: [] }) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.startsWith("/api/sea-routes") ? routes : land;
    return body instanceof Error ? Promise.reject(body) : { ok: true, json: async () => body };
  }));

const onSelect = vi.fn();
const mount = (emails: Shipment[], selected: string | null = null) =>
  render(<VoyageGlobe legs={voyageLegs(emails)} loading={false} selected={selected} onSelect={onSelect} />);
const twoLegs = [shipment({ id: "email_001" }), shipment({ id: "email_002", extractedFields: fields({ pod: "Long Beach, USA (USLGB)" }) })];
const twoRoutes = [sea[0], { from: [101.39, 3], to: [-118.21, 33.75], path: [[101.39, 3], [-118.21, 33.75]], nm: 7500 }];
const ROTTERDAM = "PORT KLANG, MALAYSIA (MYPKG)>ROTTERDAM, NETHERLANDS (NLRTM)";
const LONG_BEACH = "PORT KLANG, MALAYSIA (MYPKG)>LONG BEACH, USA (USLGB)";

beforeEach(() => {
  onSelect.mockClear();
  for (const k of Object.keys(g.calls)) delete g.calls[k];
  g.calls.controls = vi.fn(() => ({}));
  g.calls.globeMaterial = vi.fn(() => ({ color: { set: vi.fn() } }));
  g.calls._destructor = vi.fn();
  respond(sea);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoyageGlobe", () => {
  it("draws each validated leg along its sea route and lists it with its length", async () => {
    const { unmount } = mount([shipment({ id: "email_001" }), shipment({ id: "email_002", status: "discrepancy", extractedFields: fields({ pod: "Busan, South Korea" }) })]);
    expect(screen.getByText("Finding sea routes…")).toBeTruthy();
    await waitFor(() => expect(g.calls.pathsData).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/sea-routes?from=Port+Klang%2C+Malaysia+%28MYPKG%29&to=Rotterdam%2C+Netherlands+%28NLRTM%29");
    expect(g.calls.pathsData).toHaveBeenLastCalledWith([{ from: { name: "Port Klang", lng: 101.39, lat: 3 }, to: { name: "Rotterdam", lng: 4.14, lat: 51.95 }, path: sea[0].path, color: "#60a5fa", key: ROTTERDAM }]);
    expect(g.calls.htmlElementsData.mock.lastCall![0].map((p: { name: string }) => p.name)).toEqual(["Port Klang", "Rotterdam"]);
    expect(screen.getByText("1 leg from validated documents, by the shortest sea route. Pick one to see only its emails.")).toBeTruthy();
    expect(document.querySelector(".voyage-legs .leg small")!.textContent).toBe("8,290 nm · 1 email: email_001");
    unmount();
    expect(g.calls._destructor).toHaveBeenCalled();
  });

  it("gives each leg its own colour, on the globe and in the list", async () => {
    respond(twoRoutes);
    mount(twoLegs);
    await waitFor(() => expect(g.calls.pathsData).toHaveBeenCalled());
    const drawn = g.calls.pathsData.mock.lastCall![0] as { to: { name: string }; color: string }[];
    expect(drawn.map((r) => [r.to.name, r.color])).toEqual([["Rotterdam", "#60a5fa"], ["Long Beach", "#c084fc"]]);
    const colorOf = g.calls.pathColor.mock.lastCall![0] as (r: object) => string;
    expect(drawn.map(colorOf)).toEqual(["#60a5fa", "#c084fc"]);
    expect([...document.querySelectorAll<HTMLElement>(".voyage-legs .legend-dot")].map((d) => d.style.background)).toEqual(["rgb(96, 165, 250)", "rgb(192, 132, 252)"]);
  });

  it("picks a leg on click and unpicks it on a second click", () => {
    const { rerender } = mount(twoLegs);
    const [first] = screen.getAllByRole("button");
    fireEvent.click(first);
    expect(onSelect).toHaveBeenLastCalledWith(ROTTERDAM);
    rerender(<VoyageGlobe legs={voyageLegs(twoLegs)} loading={false} selected={ROTTERDAM} onSelect={onSelect} />);
    expect(first.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(first);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("makes the picked or hovered route stand out and turns the camera to the picked one", async () => {
    respond(twoRoutes);
    mount(twoLegs, LONG_BEACH);
    await waitFor(() => expect(g.calls.pathsData).toHaveBeenCalled());
    const drawn = g.calls.pathsData.mock.lastCall![0] as object[];
    const look = () => [drawn.map(g.calls.pathColor.mock.lastCall![0] as (r: object) => string), drawn.map(g.calls.pathStroke.mock.lastCall![0] as (r: object) => number)];
    expect(look()).toEqual([["#60a5fa40", "#c084fc"], [2, 3.5]]);
    expect(g.calls.pointOfView.mock.lastCall![0].lng).toBeCloseTo(157.4, 0); // between Port Klang and Long Beach, across the Pacific
    fireEvent.mouseEnter(screen.getAllByRole("button")[0]);
    expect(look()).toEqual([["#60a5fa", "#c084fc40"], [3.5, 2]]);
    fireEvent.mouseLeave(screen.getAllByRole("button")[0]);
    expect(look()).toEqual([["#60a5fa40", "#c084fc"], [2, 3.5]]);
  });

  it("skips the globe until the voyage has a validated route", () => {
    mount([shipment({ status: "discrepancy" })]);
    expect(screen.getByText(/No validated route yet/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists ports no map knows", async () => {
    respond([{ from: null, to: [4.14, 51.95], path: null, nm: null }]);
    mount([shipment()]);
    expect(await screen.findByText("Couldn't place these ports on the map.")).toBeTruthy();
    expect(screen.getByText("Not on the map: Port Klang, Malaysia (MYPKG)")).toBeTruthy();
  });

  it("says when the routes or the globe cannot load", async () => {
    respond(new Error("offline"));
    const { unmount } = mount([shipment()]);
    expect(await screen.findByText(/Couldn't find the sea routes/)).toBeTruthy();
    unmount();
    respond(sea, new Error("offline"));
    mount([shipment()]);
    expect(await screen.findByText(/Couldn't load the globe/)).toBeTruthy();
  });
});
