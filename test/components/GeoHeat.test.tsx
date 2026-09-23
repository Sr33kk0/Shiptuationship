import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadGeoChart } from "@/lib/googleCharts";
import { setTheme } from "@/lib/theme";
import GeoHeat from "@/components/GeoHeat";

vi.mock("@/lib/googleCharts", () => ({ loadGeoChart: vi.fn() }));

const draw = vi.fn();
const clearChart = vi.fn();
const palette = ["#fde2e6", "#fb7185", "#be123c"];
const paletteDark = ["#a23a58", "#f0587a", "#ffb3c1"];
const rows = [{ code: "SG", count: 3 }, { code: "NL", count: 2 }, { code: "JP", count: 1 }, { code: "US", count: 1 }];
const mount = (over = {}) => render(<GeoHeat title="Outbound" note="7 shipments · 4 countries" rows={rows} palette={palette} paletteDark={paletteDark} order={0} loading={false} {...over} />);

beforeEach(() => {
  draw.mockClear();
  clearChart.mockClear();
  delete document.documentElement.dataset.theme;
  vi.mocked(loadGeoChart).mockResolvedValue({} as never);
  (window as { google?: unknown }).google = {
    visualization: {
      arrayToDataTable: (data: unknown) => data,
      GeoChart: class {
        draw = draw;
        clearChart = clearChart;
      },
    },
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width: 500.4 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { google?: unknown }).google;
});

describe("GeoHeat", () => {
  it("draws the countries at the panel's width in the light palette", async () => {
    const { container } = mount();
    await act(async () => {});
    expect(draw).toHaveBeenCalledTimes(1);
    const [data, options] = draw.mock.calls[0];
    expect(data[0]).toEqual(["Country", "Shipments"]);
    expect(data[1]).toEqual([{ v: "SG", f: "Singapore" }, 3]);
    expect(options).toMatchObject({ width: 500, height: 310, displayMode: "regions", colorAxis: { colors: palette, minValue: 0 } });
    expect(container.querySelector(".geo-box")!.className).toContain("drawn");
  });

  it("redraws in the dark palette when the scheme changes", async () => {
    mount();
    await act(async () => {});
    act(() => setTheme("dark"));
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[1][1].colorAxis.colors).toEqual(paletteDark);
  });

  it("lists the top three countries", () => {
    const { container } = mount();
    expect([...container.querySelectorAll(".geo-top li span:last-of-type")].map((s) => s.textContent)).toEqual(["Singapore", "Netherlands", "Japan"]);
  });

  it("explains when Google Charts cannot load", async () => {
    vi.mocked(loadGeoChart).mockRejectedValue(new Error("offline"));
    mount();
    await act(async () => {});
    expect(screen.getByText("Couldn't load Google Charts. Check your connection and reload.")).toBeTruthy();
    expect(draw).not.toHaveBeenCalled();
  });

  it("says when there are no ports, and draws nothing", async () => {
    mount({ rows: [] });
    await act(async () => {});
    expect(screen.getByText("No ports yet")).toBeTruthy();
    expect(draw).not.toHaveBeenCalled();
  });

  it("shows a placeholder while loading", () => {
    const { container } = mount({ rows: [], loading: true });
    expect(screen.getByText("Mapping…")).toBeTruthy();
    expect(container.querySelector(".geo-skel")).not.toBeNull();
  });

  it("clears the map when removed", async () => {
    const { unmount } = mount();
    await act(async () => {});
    unmount();
    expect(clearChart).toHaveBeenCalled();
  });
});
