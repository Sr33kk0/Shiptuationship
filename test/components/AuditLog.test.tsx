import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/lib/audit";
import AuditLog from "@/components/AuditLog";

let query = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(query) }));

const event = (over: Partial<AuditEvent>): AuditEvent => ({
  id: "e1", at: "2026-03-20T10:15:05.000Z", kind: "review_saved", actor: "Daniel Ho", bot: false, emailId: "email_001",
  subject: "SI and BL", detail: "BL", outcome: "cleared", changes: [], ...over,
});
const userEvents = [
  event({ id: "e1", changes: [{ field: "Shipper", before: "Old", after: "New" }, { field: "Consignee", before: "", after: "X" }] }),
  event({ id: "e2", at: "2026-03-19T08:00:00.000Z", kind: "marked_read", actor: "Amy Lee", outcome: "", detail: "", subject: "" }),
  event({ id: "e3", at: "2026-03-05T08:00:00.000Z", outcome: "flagged", detail: "", changes: [{ field: "POL", before: "A", after: "" }] }),
];
const systemEvents = [
  event({ id: "s1", kind: "classified", actor: "n8n Workflow", bot: true, detail: "Spam", outcome: "" }),
  event({ id: "s2", kind: "compared", actor: "n8n Workflow", bot: true, detail: "flagged", outcome: "" }),
  event({ id: "s3", kind: "classified", actor: "n8n Workflow", bot: true, detail: "", outcome: "" }),
];

let fetchMock: ReturnType<typeof vi.fn>;
const serve = (events: AuditEvent[]) => fetchMock.mockImplementation(async () => new Response(JSON.stringify(events)));
const mount = async (source: "user" | "system" = "user") => {
  const view = render(<AuditLog source={source} />);
  await act(async () => {});
  return view;
};
const entries = () => [...document.querySelectorAll(".ev-item")];

beforeEach(() => {
  query = "";
  vi.useFakeTimers({ now: new Date("2026-03-20T12:00:00.000Z") });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditLog", () => {
  it("shows placeholders while loading", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AuditLog source="user" />);
    expect(container.querySelectorAll(".skel-row")).toHaveLength(7);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("User Log");
  });

  it("lists moderator actions grouped by day", async () => {
    serve(userEvents);
    await mount();
    expect(fetchMock).toHaveBeenCalledWith("/api/audit?source=user");
    expect([...document.querySelectorAll(".day")].map((d) => d.textContent)).toEqual(["Today", "Yesterday", "05/03/26"]);
    const [first, second] = entries();
    expect(first.querySelector(".ev-avatar")!.textContent).toBe("DH");
    expect(first.querySelector(".ev-text")!.textContent).toBe("saved verified BL fields on email_001");
    expect(first.querySelector(".ev-pill")!.textContent).toBe("Validated");
    expect(first.querySelector("time")!.textContent).toBe("10:15:05");
    expect(first.querySelector("time")!.getAttribute("title")).toBe("Today 10:15:05");
    expect(first.querySelector(".ev-sub")!.textContent).toBe("SI and BL");
    expect(second.querySelector(".ev-text")!.textContent).toBe("marked email_001 as read");
    expect(second.querySelector(".ev-pill")).toBeNull();
    expect(second.querySelector(".ev-sub")).toBeNull();
    expect(entries()[2].querySelector(".ev-text")!.textContent).toBe("saved verified fields on email_001");
    expect(entries()[2].querySelector(".ev-pill")!.textContent).toBe("Needs review");
  });

  it("gives the same person the same avatar colour", async () => {
    serve(userEvents);
    await mount();
    const hues = entries().map((e) => (e.querySelector(".ev-avatar") as HTMLElement).style.getPropertyValue("--h"));
    expect(hues[0]).toBe(hues[2]);
    expect(hues[0]).not.toBe(hues[1]);
  });

  it("expands the field changes", async () => {
    serve(userEvents);
    await mount();
    const toggle = screen.getByRole("button", { name: "2 field changes" });
    expect(screen.getByRole("button", { name: "1 field change" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const rows = [...document.querySelectorAll(".ev-embed > div")].map((d) => d.textContent);
    expect(rows).toEqual(["ShipperOld→New", "Consigneeempty→X"]);
    fireEvent.click(toggle);
    expect(document.querySelector(".ev-embed")).toBeNull();
  });

  it("shows what the automation did as Ship AI", async () => {
    serve(systemEvents);
    await mount("system");
    expect(fetchMock).toHaveBeenCalledWith("/api/audit?source=system");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("System Log");
    const [classified, compared, unknown] = entries();
    expect(classified.querySelector(".ev-who")!.textContent).toBe("Ship AIBOT");
    expect(classified.querySelector(".ev-avatar img")).not.toBeNull();
    expect(classified.querySelector(".ev-text")!.textContent).toBe("classified email_001 as Spam");
    expect(compared.querySelector(".ev-text")!.textContent).toBe("ran the SI / BL comparison on email_001");
    expect(compared.querySelector(".ev-pill")!.textContent).toBe("Needs review");
    expect(unknown.querySelector(".ev-text")!.textContent).toBe("classified email_001 as Unknown");
    expect(screen.queryByRole("button", { name: /^User/ })).toBeNull();
  });

  it("expands a comparison into its documents and each field before and after normalising", async () => {
    const side = (document: string, normalized: string, note = "", ok = true) => ({ document, normalized, note, ok });
    serve([
      event({ id: "s1", kind: "compared", actor: "n8n Workflow", bot: true, detail: "flagged", outcome: "",
        facts: [{ label: "SI document", value: "SI_1.pdf", href: "https://drive.google.com/file/d/abc/view" }, { label: "BL document", value: "Not extracted" }],
        fields: [
          { field: "Shipper", result: "formatting", si: side("Acme Pte. Ltd.", "ACME PTE LTD"), bl: side("ACME PTE LTD", "ACME PTE LTD") },
          { field: "Consignee", result: "match", si: side("B", ""), bl: side("B", "") },
          { field: "Port of Discharge (POD)", result: "mismatch", si: side("NLRTM", "", "Port was not validated.", false), bl: side("Rotterdam", "ROTTERDAM, NETHERLANDS (NLRTM)", "UN/LOCODE NLRTM added") },
        ] }),
      event({ id: "s2", kind: "classified", actor: "n8n Workflow", bot: true, detail: "Spam", outcome: "", facts: [{ label: "From", value: "amy@x.com" }] }),
    ]);
    await mount("system");
    fireEvent.click(screen.getByRole("button", { name: "3 fields compared, 1 mismatched" }));
    expect(screen.getByRole("link", { name: "SI_1.pdf" }).getAttribute("href")).toBe("https://drive.google.com/file/d/abc/view");
    expect(screen.getByText("Not extracted")).toBeTruthy();
    const rows = [...document.querySelectorAll(".ev-cmp tbody tr")].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ["Shipper", "SI", "Acme Pte. Ltd.", "ACME PTE LTD", "Match after normalising"],
      ["BL", "ACME PTE LTD", "ACME PTE LTD"],
      ["Consignee", "SI", "B", "identical", "Exact match"],
      ["BL", "B", "identical"],
      ["Port of Discharge (POD)", "SI", "NLRTM", "emptyPort was not validated.", "Mismatch"],
      ["BL", "Rotterdam", "ROTTERDAM, NETHERLANDS (NLRTM)UN/LOCODE NLRTM added"],
    ]);
    expect(document.querySelector(".ev-note[data-warn]")!.textContent).toBe("Port was not validated.");
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("amy@x.com")).toBeTruthy();
  });

  it("filters by action and user from the address", async () => {
    serve(userEvents);
    query = "action=review_saved&user=Daniel%20Ho";
    await mount();
    expect(entries()).toHaveLength(2);
    query = "action=marked_read&user=Daniel%20Ho";
    await mount();
    expect(screen.getByText("No log entries match your filters.")).toBeTruthy();
  });

  it("ignores an action that belongs to the other log", async () => {
    serve(userEvents);
    query = "action=classified";
    await mount();
    expect(entries()).toHaveLength(3);
  });

  it("offers filter links counted against the other filter", async () => {
    serve(userEvents);
    query = "user=Daniel%20Ho";
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^Action/ }));
    const actions = screen.getAllByRole("menuitemradio").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(actions).toEqual([
      ["All actions2", "/audit/user?user=Daniel+Ho"],
      ["Review saved2", "/audit/user?action=review_saved&user=Daniel+Ho"],
      ["Cleared0", "/audit/user?action=cleared&user=Daniel+Ho"],
      ["Marked read0", "/audit/user?action=marked_read&user=Daniel+Ho"],
    ]);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /^User/ }));
    const users = screen.getAllByRole("menuitemradio").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(users).toEqual([
      ["All users3", "/audit/user"],
      ["Amy Lee1", "/audit/user?user=Amy+Lee"],
      ["Daniel Ho2", "/audit/user?user=Daniel+Ho"],
    ]);
  });

  it("says when the log cannot be loaded", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 502 }));
    await mount();
    expect(screen.getByText("Could not load the audit log from Firestore.")).toBeTruthy();
  });

  it("refreshes every 30 seconds and keeps the log if a refresh fails", async () => {
    serve(userEvents);
    await mount();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(entries()).toHaveLength(3);
  });

  it("pages long logs", async () => {
    serve(Array.from({ length: 30 }, (_, i) => event({ id: `x${i}` })));
    await mount();
    expect(entries()).toHaveLength(25);
    expect(screen.getByText("Showing 1–25 of 30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(entries()).toHaveLength(5);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50" } });
    expect(entries()).toHaveLength(30);
  });
});
