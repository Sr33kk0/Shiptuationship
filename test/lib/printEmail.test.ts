import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fields, shipment } from "@/test/fixtures";
import { printEmail } from "@/lib/printEmail";

let blob: Blob | undefined;
beforeEach(() => {
  blob = undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blob = b as Blob;
    return "blob:print";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const html = async () => blob!.text();

describe("printEmail", () => {
  it("opens the page in a new tab and frees it after a minute", () => {
    vi.useFakeTimers();
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    expect(printEmail(shipment())).toBe(true);
    expect(open).toHaveBeenCalledWith("blob:print", "_blank");
    expect(blob!.type).toBe("text/html");
    vi.advanceTimersByTime(59_999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:print");
  });

  it("reports a blocked pop-up", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(printEmail(shipment())).toBe(false);
  });

  it("escapes everything that came from the email", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    printEmail(shipment({ subject: "<script>alert(1)</script>", emailBody: `"Tom" & 'Jerry'`, attachmentNames: ["<b>.pdf"] }));
    const page = await html();
    expect(page).not.toContain("<script>alert");
    expect(page).toContain("&#60;script&#62;alert(1)&#60;/script&#62;");
    expect(page).toContain("&#34;Tom&#34; &#38; &#39;Jerry&#39;");
    expect(page).toContain("<li>&#60;b&#62;.pdf</li>");
  });

  it("lists the details, the comparison and the mismatched fields", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    printEmail(shipment({
      id: "email_042",
      senderName: "Jane",
      sender: "jane@example.com",
      status: "discrepancy",
      isRead: true,
      reviewReasons: ["Container Count differs"],
      referenceFields: fields(),
      extractedFields: fields({ containerCount: "4" }),
      discrepancies: [{ field: "containerCount", label: "Container Count", si: "3", bl: "4", note: "major" }],
      auditTrail: [{ time: "20 Mar 2026, 09:15", action: "Classified" }],
      reviewedAt: "2026-03-20T10:00:00Z",
      reviewedBy: "",
    }));
    const page = await html();
    expect(page).toContain("<title>email_042</title>");
    expect(page).toContain("<th>From</th><td>Jane &#60;jane@example.com&#62;</td>");
    expect(page).toContain("<th>Status</th><td>Needs Review</td>");
    expect(page).toContain("<th>Read</th><td>Read</td>");
    expect(page).toContain("Unknown reviewer · 20 Mar 2026, 18:00:00 MYT");
    expect(page).toContain("<li>Container Count differs</li>");
    expect(page).toContain('<td class="bad">3 units</td><td class="bad">4 units</td><td class="bad">Mismatch</td>');
    expect(page).toContain("<td>22000 kg</td><td>22000 kg</td><td>Match</td>");
    expect(page).toContain("Container Count: 3 on the SI vs 4 on the Draft BL — major");
    expect(page).toContain("<td>Classified</td>");
  });

  it("leaves out empty sections and rows", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    printEmail(shipment({ category: "general", siRef: undefined, attachmentNames: [], auditTrail: [], reviewReasons: [] }));
    const page = await html();
    expect(page).not.toContain("SI vs Draft BL");
    expect(page).not.toContain("SI reference");
    expect(page).not.toContain("Attachments (");
    expect(page).not.toContain("Audit trail");
    expect(page).not.toContain("Human review required");
  });
});
