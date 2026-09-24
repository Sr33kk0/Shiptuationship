import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import { shipment } from "@/test/fixtures";
import Shipments from "@/components/Shipments";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));
vi.mock("@/lib/useShipments", () => ({ useShipments: vi.fn() }));
vi.mock("@/components/Emails", () => ({ default: ({ voyage }: { voyage?: string }) => <main>emails:{voyage}</main> }));

const state = (shipments: Shipment[], loadState: "loading" | "ready" | "error" = "ready") =>
  vi.mocked(useShipments).mockReturnValue({ shipments, loadState, setShipments: vi.fn(), busy: { current: false } });
const names = () => [...document.querySelectorAll(".ship-name")].map((n) => n.textContent);

afterEach(() => {
  query = "";
  vi.restoreAllMocks();
});

const emails = [
  shipment({ id: "email_001", subject: "Draft BL NAP 914", vessel: "NAP 914", voyage: "BS007", at: "2026-03-05T09:00:00.000Z" }),
  shipment({ id: "email_002", subject: "Summary NAP 914", vessel: "NAP 914", voyage: "BS007", at: "2026-03-20T09:00:00.000Z", status: "discrepancy" }),
  shipment({ id: "email_003", subject: "Berthing LE HAVRE", vessel: "LE HAVRE", voyage: "QI540A", at: "2026-03-10T09:00:00.000Z", category: "general" }),
  shipment({ id: "email_004", subject: "NAP 914 next voyage", vessel: "NAP 914", voyage: "BS008", at: "2026-03-01T09:00:00.000Z" }),
  shipment({ id: "email_005", subject: "No vessel", at: "2026-03-30T09:00:00.000Z" }),
];

describe("Shipments", () => {
  it("groups emails by vessel and voyage, latest activity first, skipping emails without a voyage", () => {
    state(emails);
    render(<Shipments />);
    expect(names()).toEqual(["NAP 914Vessel BS007", "LE HAVREVessel QI540A", "NAP 914Vessel BS008"]);
    const [first] = document.querySelectorAll(".ship");
    expect(first.querySelector(".ship-meta")!.textContent).toMatch(/^2 emails · 1 route/); // the discrepancy's comparison isn't validated, so its ports don't count
    expect(first.querySelector(".status")!.textContent).toBe("1 Needs Review");
    expect(first.getAttribute("href")).toBe("/shipments?voyage=NAP%20914%20V.BS007");
  });

  it("shows one voyage's page when the address names a voyage", () => {
    query = "voyage=NAP+914+V.BS007";
    state(emails);
    render(<Shipments />);
    expect(screen.getByRole("main").textContent).toBe("emails:NAP 914 V.BS007");
    expect(document.querySelector(".ships")).toBeNull();
  });

  it("searches by vessel or voyage", () => {
    state(emails);
    render(<Shipments />);
    fireEvent.change(screen.getByLabelText("Search shipments"), { target: { value: "qi540" } });
    expect(names()).toEqual(["LE HAVREVessel QI540A"]);
    fireEvent.change(screen.getByLabelText("Search shipments"), { target: { value: "zzz" } });
    expect(screen.getByText("No shipments match your search.")).toBeTruthy();
  });

  it("shows placeholders while loading and says when loading failed", () => {
    state([], "loading");
    const { unmount } = render(<Shipments />);
    expect(document.querySelectorAll(".ship-skel")).toHaveLength(6);
    unmount();
    state([], "error");
    render(<Shipments />);
    expect(screen.getByText("Could not load shipments from Firestore.")).toBeTruthy();
  });
});
