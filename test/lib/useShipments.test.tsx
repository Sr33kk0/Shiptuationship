import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shipment } from "@/test/fixtures";
import { ShipmentsProvider, useShipments } from "@/lib/useShipments";

let latest: ReturnType<typeof useShipments>;
function Probe() {
  latest = useShipments();
  return <p>{`${latest.loadState}:${latest.shipments.map((s) => s.id).join(",")}`}</p>;
}
const mount = () => render(<ShipmentsProvider><Probe /></ShipmentsProvider>);
const ok = (ids: string[]) => new Response(JSON.stringify(ids.map((id) => shipment({ id }))));
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShipmentsProvider", () => {
  it("loads the emails once and shares them", async () => {
    const fetchMock = vi.fn(async () => ok(["a", "b"]));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(screen.getByText("loading:")).toBeTruthy();
    await flush();
    expect(screen.getByText("ready:a,b")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/emails");
  });

  it("shows an error when the first load fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    mount();
    await flush();
    expect(screen.getByText("error:")).toBeTruthy();
  });

  it("polls every 30 seconds and keeps the last data when a poll fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(["a"])).mockResolvedValueOnce(ok(["a", "b"])).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await flush();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("ready:a,b")).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("ready:a,b")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not overwrite rows while a save is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok(["a"])).mockResolvedValueOnce(ok(["stale"])));
    mount();
    await flush();
    latest.busy.current = true;
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("ready:a")).toBeTruthy();
  });

  it("stops polling when unmounted", async () => {
    const fetchMock = vi.fn(async () => ok([]));
    vi.stubGlobal("fetch", fetchMock);
    mount().unmount();
    await act(async () => vi.advanceTimersByTime(90_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets pages update the shared rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok(["a"])));
    mount();
    await flush();
    act(() => latest.setShipments([shipment({ id: "z" })]));
    expect(screen.getByText("ready:z")).toBeTruthy();
  });
});

describe("useShipments", () => {
  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useShipments())).toThrow("useShipments must be used inside <ShipmentsProvider>");
  });
});
