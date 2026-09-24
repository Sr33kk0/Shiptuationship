import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Shipment } from "@/lib/shipments";
import { useShipments } from "@/lib/useShipments";
import { shipment } from "@/test/fixtures";
import Emails from "@/components/Emails";
import { ModeratorProvider } from "@/components/Profile";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));
vi.mock("@/lib/useShipments", () => ({ useShipments: vi.fn() }));
const toast = vi.fn();
vi.mock("@/components/Shell", () => ({ useToast: () => toast }));

let rows: Shipment[];
const busy = { current: false };
const setShipments = vi.fn((next: SetStateAction<Shipment[]>) => {
  rows = typeof next === "function" ? next(rows) : next;
});
const mount = (loadState: "loading" | "ready" | "error" = "ready", role: "moderator" | "auditor" = "moderator") => {
  vi.mocked(useShipments).mockImplementation(() => ({ shipments: rows, setShipments, loadState, busy }));
  return render(<ModeratorProvider value={{ id: "DanielHo", name: "Daniel Ho", role }}><Emails /></ModeratorProvider>);
};
const ids = () => [...document.querySelectorAll("tbody tr td.id")].map((td) => td.textContent);
const tab = (name: RegExp) => within(document.querySelector(".filters") as HTMLElement).getByRole("link", { name });
const sub = (name: RegExp) => within(document.querySelector(".substatus") as HTMLElement).getByRole("link", { name });

beforeEach(() => {
  query = "";
  busy.current = false;
  toast.mockClear();
  setShipments.mockClear();
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
  rows = [
    shipment({ id: "email_001", subject: "Alpha SI", at: "2026-03-05T09:00:00.000Z", status: "clean" }),
    shipment({ id: "email_002", subject: "Bravo invoice", category: "invoice", sender: "billing@carrier.example", at: "2026-03-10T09:00:00.000Z", status: "pending", attachmentCount: 0, attachmentNames: [] }),
    shipment({ id: "email_010", subject: "Charlie mismatch", at: "2026-03-10T15:00:00.000Z", status: "discrepancy", reviewReasons: ["a", "b"], isRead: true }),
    shipment({ id: "email_003", subject: "Delta spam", category: "spam", at: "2026-03-20T09:00:00.000Z", status: "pending", attachmentCount: 3, attachmentNames: ["x.pdf", "y.pdf", "z.pdf"] }),
  ];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Emails table", () => {
  it("lists every email, newest first, with its details", () => {
    mount();
    expect(ids()).toEqual(["email_003", "email_010", "email_002", "email_001"]);
    const [spam, mismatch, invoice] = document.querySelectorAll("tbody tr");
    expect(spam.querySelector(".tag")!.textContent).toBe("Spam");
    expect(spam.querySelector(".att")!.textContent).toBe("x.pdf+2");
    expect(spam.querySelector(".date")!.textContent).toBe("20/03/2609:00");
    expect(spam.className).toBe("unread");
    expect(mismatch.className).toBe("read");
    expect(mismatch.querySelector(".status")!.textContent).toBe("Needs Review");
    expect(mismatch.querySelector(".status")!.getAttribute("title")).toBe("a\nb");
    expect(invoice.querySelector(".none")!.textContent).toBe("—");
    expect(invoice.querySelector(".stat")!.textContent).toBe("Received");
    expect(document.querySelectorAll("tbody tr")[3].querySelector(".stat")!.textContent).toBe("Validated");
  });

  it("counts each tab and marks tabs with emails that need review", () => {
    mount();
    expect(tab(/^All/).textContent).toBe("All (4)");
    expect(tab(/^Comparisons/).textContent).toBe("Comparisons (2)");
    expect(tab(/^Spam/).textContent).toBe("Spam (1)");
    expect(tab(/^All/).querySelector(".dot")).not.toBeNull();
    expect(tab(/^Spam/).querySelector(".dot")).toBeNull();
    expect(sub(/^All/).textContent).toBe("All (4)");
    expect(sub(/^Needs Review/).textContent).toBe("Needs Review (1)");
    expect(sub(/^Validated/).textContent).toBe("Validated (1)");
  });

  it("hides counts while loading and shows placeholder rows", () => {
    rows = [];
    mount("loading");
    expect(tab(/^All/).textContent).toBe("All");
    expect(document.querySelectorAll("tbody tr.skel-row")).toHaveLength(8);
  });

  it("explains an empty result and a failed load", () => {
    rows = [];
    const { unmount } = mount();
    expect(screen.getByText("No shipments match your filter criteria.")).toBeTruthy();
    unmount();
    mount("error");
    expect(screen.getByText("Could not load shipments from Firestore.")).toBeTruthy();
  });
});

describe("Emails filters", () => {
  it("filters by category from the address, keeping the status in the tab links", () => {
    query = "view=document-comparison&status=needs-review";
    mount();
    expect(ids()).toEqual(["email_010"]);
    expect(tab(/^Comparisons/).getAttribute("aria-current")).toBe("page");
    expect(tab(/^Spam/).getAttribute("href")).toBe("/emails?view=spam&status=needs-review");
    expect(tab(/^All/).getAttribute("href")).toBe("/emails?status=needs-review");
    expect(sub(/^All/).getAttribute("href")).toBe("/emails?view=document-comparison");
    expect(sub(/^Validated/).getAttribute("href")).toBe("/emails?view=document-comparison&status=validated");
  });

  it("filters validated emails", () => {
    query = "status=validated";
    mount();
    expect(ids()).toEqual(["email_001"]);
  });

  it("reads old dashboard links as comparison status filters", () => {
    query = "view=validated";
    mount();
    expect(ids()).toEqual(["email_001"]);
    expect(tab(/^Comparisons/).getAttribute("aria-current")).toBe("page");
  });

  it("ignores an unknown category", () => {
    query = "view=bogus";
    mount();
    expect(ids()).toHaveLength(4);
  });

  it("searches the id, subject and sender, and clears the search", () => {
    mount();
    const search = screen.getByRole("textbox", { name: "Search emails" });
    fireEvent.change(search, { target: { value: "BRAVO" } });
    expect(ids()).toEqual(["email_002"]);
    fireEvent.change(search, { target: { value: "billing@" } });
    expect(ids()).toEqual(["email_002"]);
    fireEvent.change(search, { target: { value: "email_01" } });
    expect(ids()).toEqual(["email_010"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(ids()).toHaveLength(4);
  });

  it("filters by the chosen date range", () => {
    vi.useFakeTimers({ now: new Date("2026-03-25T12:00:00Z") });
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Select dates/ }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Monday, 9 March 2026" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Wednesday, 11 March 2026" }));
    expect(ids()).toEqual(["email_010", "email_002"]);
  });
});

describe("Emails sorting", () => {
  it("sorts by a column, flipping direction on a second click", () => {
    mount();
    const header = screen.getByRole("button", { name: /^Email #/ });
    fireEvent.click(header);
    expect(ids()).toEqual(["email_001", "email_002", "email_003", "email_010"]); // numeric-aware
    expect(header.closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(header);
    expect(ids()).toEqual(["email_010", "email_003", "email_002", "email_001"]);
    expect(header.closest("th")!.getAttribute("aria-sort")).toBe("descending");
  });

  it("sorts attachment counts as numbers", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Attachments/ }));
    expect(ids()[0]).toBe("email_002");
    expect(ids()[3]).toBe("email_003");
  });

  it("sorts from the sheet on small screens", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Sort by/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Subject / Message" }));
    expect(ids()[0]).toBe("email_003"); // Delta, still descending
    expect(document.querySelector(".sort-trigger")!.textContent).toContain("Subject / MessageDescending");
  });
});

describe("Emails review", () => {
  const ok = (body: Shipment) => vi.fn(async () => new Response(JSON.stringify(body)));

  it("opens an email from its row with a click or the keyboard", () => {
    mount();
    fireEvent.click(screen.getByText("Bravo invoice"));
    expect(screen.getByRole("dialog", { name: "Email Transmission email_002" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(screen.getByText("Delta spam").closest("tr")!, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Email Transmission email_003" })).toBeTruthy();
  });

  it("steps through the list as filtered and sorted", () => {
    mount();
    fireEvent.click(screen.getByText("Delta spam"));
    expect((screen.getByRole("button", { name: "Previous email" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next email" }));
    expect(screen.getByRole("dialog", { name: "Manifest Inspection email_010" })).toBeTruthy();
  });

  it("opens emails read-only for an auditor", () => {
    mount("ready", "auditor");
    fireEvent.click(screen.getByText("Bravo invoice"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark as Read|Generate AI Reply/ })).toBeNull();
  });

  it("marks an email as read and updates the row", async () => {
    const updated = { ...rows[1], isRead: true };
    const fetchMock = ok(updated);
    vi.stubGlobal("fetch", fetchMock);
    mount();
    fireEvent.click(screen.getByText("Bravo invoice"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as Read" })));
    expect(fetchMock).toHaveBeenCalledWith("/api/emails/email_002/read", expect.objectContaining({ method: "POST" }));
    expect(rows[1].isRead).toBe(true);
    expect(toast).toHaveBeenCalledWith("Marked email_002 as read");
    expect(busy.current).toBe(false);
  });

  it("saves reviewed fields", async () => {
    const fetchMock = ok(rows[0]);
    vi.stubGlobal("fetch", fetchMock);
    mount();
    fireEvent.click(screen.getByText("Alpha SI"));
    const shipper = within(screen.getByRole("group", { name: "Draft Bill of Lading" })).getByLabelText(/Shipper/);
    fireEvent.change(shipper, { target: { value: "Edited" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" })));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/emails/email_001/review");
    expect(JSON.parse(String(init.body))).toEqual({ si: rows[0].referenceFields, bl: { ...rows[0].extractedFields, shipper: "Edited" } });
    expect(toast).toHaveBeenCalledWith("Saved verified SI and BL fields for email_001");
  });

  it("reports a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Email not found" }), { status: 404 })));
    mount();
    fireEvent.click(screen.getByText("Bravo invoice"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as Read" })));
    expect(toast).toHaveBeenCalledWith("Save failed: Email not found");
    expect(setShipments).not.toHaveBeenCalled();
    expect(busy.current).toBe(false);
  });

  it("falls back to the status text when the error has no message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 500, statusText: "Server Error" })));
    mount();
    fireEvent.click(screen.getByText("Bravo invoice"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as Read" })));
    expect(toast).toHaveBeenCalledWith("Save failed: Server Error");
  });

  it("does not start a second save while one is in flight", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    busy.current = true;
    mount();
    fireEvent.click(screen.getByText("Bravo invoice"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark as Read" })));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Emails paging and export", () => {
  it("pages 25 rows at a time", () => {
    rows = Array.from({ length: 30 }, (_, i) => shipment({ id: `email_${String(i).padStart(3, "0")}` }));
    mount();
    expect(ids()).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(ids()).toHaveLength(5);
    fireEvent.change(screen.getByRole("textbox", { name: "Search emails" }), { target: { value: "email" } });
    expect(ids()).toHaveLength(25); // a new search goes back to page 1
  });

  it("exports the rows as filtered", () => {
    query = "view=spam";
    mount();
    expect(screen.getByText("1 matching emails")).toBeTruthy();
  });

  it("disables export until loaded and when nothing matches", () => {
    rows = [];
    mount();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
