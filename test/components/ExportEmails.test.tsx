import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shipment } from "@/test/fixtures";
import ExportEmails from "@/components/ExportEmails";

const toast = vi.fn();
vi.mock("@/components/Shell", () => ({ useToast: () => toast }));

let blob: Blob | undefined;
let downloaded: HTMLAnchorElement | undefined;
beforeEach(() => {
  toast.mockClear();
  blob = downloaded = undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blob = b as Blob;
    return "blob:export";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloaded = this;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const rows = [shipment({ id: "a" }), shipment({ id: "b" })];
const details = () => document.querySelector("details")!;

describe("ExportEmails", () => {
  it("downloads the rows as CSV and closes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"], now: new Date("2026-03-20T09:15:30.000Z") });
    render(<ExportEmails rows={rows} disabled={false} />);
    expect(screen.getByText("2 matching emails")).toBeTruthy();
    details().open = true;
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(blob!.type).toBe("text/csv;charset=utf-8");
    expect((await blob!.text()).split("\r\n")).toHaveLength(3);
    expect(downloaded!.download).toBe("emails-2026-03-20T09-15-30.000Z.csv");
    expect(downloaded!.href).toBe("blob:export");
    expect(document.body.contains(downloaded!)).toBe(false);
    expect(toast).toHaveBeenCalledWith("Exported 2 emails as CSV");
    expect(details().open).toBe(false);

    act(() => vi.advanceTimersByTime(1000));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("downloads JSON", async () => {
    render(<ExportEmails rows={rows} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(blob!.type).toBe("application/json;charset=utf-8");
    expect(Object.keys(JSON.parse(await blob!.text()))).toEqual(["a", "b"]);
    expect(downloaded!.download).toMatch(/\.json$/);
    expect(toast).toHaveBeenCalledWith("Exported 2 emails as JSON");
  });

  it("does nothing while disabled", () => {
    render(<ExportEmails rows={rows} disabled />);
    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    const summary = document.querySelector("summary")!;
    expect(summary.getAttribute("aria-disabled")).toBe("true");
    expect(fireEvent.click(summary)).toBe(false); // default (opening) prevented
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("reports a failed export", () => {
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      throw new Error("quota");
    });
    render(<ExportEmails rows={rows} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(toast).toHaveBeenCalledWith("Export failed. Please try again.");
  });

  it("closes on Escape, a click outside or losing focus", () => {
    render(<><ExportEmails rows={rows} disabled={false} /><button>elsewhere</button></>);
    details().open = true;
    fireEvent.keyDown(details(), { key: "Escape" });
    expect(details().open).toBe(false);
    expect(document.activeElement).toBe(document.querySelector("summary"));

    details().open = true;
    fireEvent.pointerDown(details());
    expect(details().open).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(details().open).toBe(false);

    details().open = true;
    fireEvent.blur(details(), { relatedTarget: screen.getByRole("button", { name: "Export JSON" }) });
    expect(details().open).toBe(true);
    fireEvent.blur(details(), { relatedTarget: screen.getByRole("button", { name: "elsewhere" }) });
    expect(details().open).toBe(false);
  });
});
