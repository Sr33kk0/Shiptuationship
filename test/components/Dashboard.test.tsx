import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import { fields, shipment } from "@/test/fixtures";
import Dashboard from "@/components/Dashboard";

vi.mock("@/lib/useShipments", () => ({ useShipments: vi.fn() }));
vi.mock("@/lib/googleCharts", () => ({ loadGeoChart: () => new Promise(() => {}) }));

const state = (shipments: Shipment[], loadState: "loading" | "ready" | "error" = "ready") =>
  vi.mocked(useShipments).mockReturnValue({ shipments, loadState, setShipments: vi.fn(), busy: { current: false } });
const text = () => document.body.textContent!;
const reviewLink = () => document.querySelector<HTMLAnchorElement>(".review-action")!;

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const three = [
  shipment({ id: "a", isRead: true, sender: "x@a.com", referenceFields: fields({ shipper: "Acme", pol: "SINGAPORE", pod: "Rotterdam, Netherlands" }) }),
  shipment({ id: "b", status: "discrepancy", sender: "x@a.com", referenceFields: null, extractedFields: fields({ shipper: "acme", pol: "Tokyo, Japan", pod: "Atlantis" }) }),
  shipment({ id: "c", category: "spam", sender: "y@b.com", referenceFields: null, extractedFields: null }),
];

describe("Dashboard", () => {
  it("summarises read status overall and per category", () => {
    state(three);
    render(<Dashboard />);
    expect(text()).toContain("33% read");
    expect(text()).toContain("1 of 3 emails read");
    expect(text()).toContain("2 unread");
    const bar = screen.getByRole("progressbar", { name: "Emails read" });
    expect([bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-valuemax")]).toEqual(["1", "3"]);
    const cats = [...document.querySelectorAll(".cat-read li")].map((li) => li.getAttribute("title"));
    expect(cats).toEqual(["SI BL Comparison: 1 of 2 read", "Spam: 0 of 1 read"]);
  });

  it("never shows 0% while some emails are read", () => {
    state(Array.from({ length: 150 }, (_, i) => shipment({ id: `e${i}`, isRead: i === 0 })));
    render(<Dashboard />);
    expect(text()).toContain("<1% read");
  });

  it("points to the flagged emails when some need review", () => {
    state(three);
    render(<Dashboard />);
    expect(document.querySelector(".review-card .big")!.textContent).toBe("1");
    expect(text()).toContain("Email requires your attention.");
    expect(reviewLink().getAttribute("href")).toBe("/emails?status=needs-review");
    expect(reviewLink().textContent).toBe("Review flagged emails");
  });

  it("says when everything is caught up", () => {
    state([shipment()]);
    render(<Dashboard />);
    expect(text()).toContain("You're all caught up. No emails need human review.");
    expect(reviewLink().getAttribute("href")).toBe("/emails");
    expect(reviewLink().textContent).toBe("View all emails");
  });

  it("explains a failed load", () => {
    state([], "error");
    render(<Dashboard />);
    expect(document.querySelector(".review-card .big")!.textContent).toBe("—");
    expect(text()).toContain("Unable to load the review queue.");
    expect(reviewLink().textContent).toBe("Open review queue");
  });

  it("shows placeholders while loading", () => {
    state([], "loading");
    render(<Dashboard />);
    expect(text()).toContain("Counting emails…");
    expect(text()).toContain("Checking for emails that need your attention…");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("ranks parties from the SI, falling back to the draft BL, and maps the ports", () => {
    state(three);
    render(<Dashboard />);
    const panel = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
    expect(panel("Most Frequent Shippers").textContent).toContain("Top 3 of 2 shipments");
    expect(panel("Most Frequent Shippers").querySelectorAll(".bar-name")).toHaveLength(1); // "Acme" and "acme" are one shipper
    expect(panel("Most Frequent Email Senders").textContent).toContain("Top 3 of 3 emails");
    expect(panel("Outbound · Port of Loading").textContent).toContain("2 shipments · 2 countries");
    expect(panel("Inbound · Port of Discharge").textContent).toContain("1 shipments · 1 country (1 unplaced)");
  });
});
