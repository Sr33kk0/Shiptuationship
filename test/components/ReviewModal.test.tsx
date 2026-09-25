import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { printEmail } from "@/lib/printEmail";
import type { Shipment } from "@/lib/shipments";
import { fields, shipment } from "@/test/fixtures";
import ReviewModal from "@/components/ReviewModal";

vi.mock("@/lib/printEmail", () => ({ printEmail: vi.fn() }));

type Props = ComponentProps<typeof ReviewModal>;
type Handlers = { [K in "onClose" | "onSave" | "onMarkRead" | "onClear" | "onToast"]: Mock<Props[K]> } & { onPrev?: Mock<() => void>; onNext?: Mock<() => void> };

let reduced = true;
let handlers: Handlers;
beforeEach(() => {
  reduced = true;
  handlers = { onClose: vi.fn(), onSave: vi.fn(), onMarkRead: vi.fn(), onClear: vi.fn(), onToast: vi.fn(), onPrev: vi.fn(), onNext: vi.fn() };
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ matches: reduced }) as MediaQueryList);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = (s: Shipment = shipment(), over: Partial<typeof handlers> & { saving?: boolean } = {}) => {
  const { saving = false, ...rest } = over;
  Object.assign(handlers, rest);
  return render(<ReviewModal shipment={s} saving={saving} {...handlers} />);
};
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const paper = (kind: "si" | "bl") => within(screen.getByRole("group", { name: kind === "si" ? "Shipping Instruction" : "Draft Bill of Lading" }));
const input = (label: RegExp, kind: "si" | "bl" = "bl") => paper(kind).getByLabelText(label) as HTMLInputElement;
const toEmail = () => fireEvent.click(within(document.querySelector(".modal-actions")!).getByRole("button", { name: "Read Email" }));
const mismatch = shipment({ referenceFields: fields(), extractedFields: fields({ containerCount: "4" }) });

describe("ReviewModal header", () => {
  it("names a comparison email and shows when it arrived", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Manifest Inspection email_001" })).toBeTruthy();
    expect(document.querySelector(".modal-head .tag")!.textContent).toBe("SI vs Draft BL");
    expect(document.querySelector(".modal-title small")!.textContent).toBe("ops@meridian.example • 20/03/26 09:15");
  });

  it("shows who reviewed it and who marked it read, in Malaysian time", () => {
    mount(shipment({ reviewedAt: "2026-03-20T10:00:00Z", reviewedBy: "DanielHo", markedReadAt: "2026-03-20T11:00:00Z" }));
    expect(screen.getByText("Reviewed by DanielHo · 20 Mar 2026, 18:00:00 MYT")).toBeTruthy();
    expect(screen.getByText("Marked as read by Unknown reviewer · 20 Mar 2026, 19:00:00 MYT")).toBeTruthy();
  });

  it("marks as read from beside Save Changes, and shows the read and saving states", () => {
    const { rerender } = mount();
    const foot = () => [...document.querySelectorAll(".doc-foot button")] as HTMLButtonElement[];
    expect(foot().map((b) => b.textContent)).toEqual(["Reset to Original", "Save Changes", "Mark as Read"]);
    expect(within(document.querySelector(".modal-actions")!).queryByRole("button", { name: "Mark as Read" })).toBeNull();
    fireEvent.click(button("Mark as Read"));
    expect(handlers.onMarkRead).toHaveBeenCalled();
    rerender(<ReviewModal shipment={shipment()} saving {...handlers} />);
    expect(foot()[2].textContent).toBe("Saving…");
    expect(foot()[2].disabled).toBe(true);
    rerender(<ReviewModal shipment={shipment({ isRead: true })} saving={false} {...handlers} />);
    expect((button("Read") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows an auditor the documents and the email but no way to change anything", () => {
    render(<ReviewModal shipment={mismatch} saving={false} readOnly {...handlers} />);
    expect(document.querySelector(".paper.si")).toBeTruthy();
    expect(document.querySelector(".paper.bl .v.bad")).toBeTruthy(); // mismatches still show
    expect(document.querySelector(".paper input")).toBeNull();
    expect(document.querySelector(".paper.bl .num")!.textContent).toBe("4");
    expect(screen.queryByRole("button", { name: /Mark as Read|Save|Reset/ })).toBeNull();
    toEmail();
    expect(screen.queryByRole("button", { name: /Generate AI Reply/ })).toBeNull();
    cleanup();
    render(<ReviewModal shipment={shipment({ category: "invoice", referenceFields: null, extractedFields: null })} saving={false} readOnly {...handlers} />);
    expect(document.querySelector(".plain-card")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark as Read|Generate AI Reply/ })).toBeNull();
  });

  it("prints, asking to allow pop-ups when blocked", () => {
    const s = shipment();
    mount(s);
    vi.mocked(printEmail).mockReturnValueOnce(true);
    fireEvent.click(button(/Print/));
    expect(printEmail).toHaveBeenCalledWith(s);
    expect(handlers.onToast).not.toHaveBeenCalled();
    vi.mocked(printEmail).mockReturnValueOnce(false);
    fireEvent.click(button(/Print/));
    expect(handlers.onToast).toHaveBeenCalledWith("Allow pop-ups to open the print preview");
  });

  it("lists the review reasons and folds them away", () => {
    mount(shipment({ status: "discrepancy", reviewReasons: ["Container differs", "Port unknown"] }));
    const banner = screen.getByRole("region", { name: "Human review reasons" });
    expect([...banner.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["Container differs", "Port unknown"]);
    fireEvent.click(button("Hide review reasons"));
    expect(banner.className).toContain("collapsed");
    fireEvent.click(button("Show review reasons"));
    expect(banner.className).not.toContain("collapsed");
  });
});

describe("ReviewModal email pane", () => {
  it("shows the email with its attachments, linking the ones in Drive", () => {
    mount(shipment({ attachmentLinks: { "email_001_SI.pdf": "https://drive.google.com/file/d/1/view" } }));
    toEmail();
    expect(screen.getByRole("heading", { name: "SI and draft BL for review" })).toBeTruthy();
    expect(screen.getByText("Please check the attached SI and BL.")).toBeTruthy();
    expect(screen.getByText("Attachments (2)")).toBeTruthy();
    const link = screen.getByRole("link", { name: /email_001_SI\.pdf/ });
    expect([link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")]).toEqual(["https://drive.google.com/file/d/1/view", "_blank", "noopener noreferrer"]);
    expect(screen.queryByRole("link", { name: /email_001_BL\.pdf/ })).toBeNull();
    expect(screen.getByText("email_001_BL.pdf")).toBeTruthy();
  });

  it("opens the side-by-side review from the email", () => {
    mount();
    toEmail();
    fireEvent.click(within(document.querySelector(".reply-actions")!).getByRole("button", { name: "Side-by-Side Review" }));
    expect(document.querySelector(".paper input")).not.toBeNull();
  });
});

describe("ReviewModal side-by-side review", () => {
  const saveButton = () => button("Save Changes") as HTMLButtonElement;
  const resetButton = () => button(/Reset to Original/) as HTMLButtonElement;

  it("edits both documents in place and saves them together", () => {
    mount();
    expect(input(/Shipper/).value).toBe("Meridian Textiles Sdn Bhd");
    expect(saveButton().disabled).toBe(true); // nothing to save yet
    fireEvent.change(input(/Container Count/), { target: { value: "5" } });
    fireEvent.change(input(/Shipper/, "si"), { target: { value: "New SI shipper" } });
    fireEvent.click(saveButton());
    expect(handlers.onSave).toHaveBeenCalledWith({ si: fields({ shipper: "New SI shipper" }), bl: fields({ containerCount: "5" }) });
  });

  it("marks live differences on both documents", () => {
    mount();
    fireEvent.change(input(/Container Count/), { target: { value: "4" } });
    expect(input(/Container Count/).className).toContain("bad");
    expect(input(/Container Count/, "si").className).toContain("bad");
    expect(input(/Shipper/).className).not.toContain("bad");
    fireEvent.change(input(/Container Count/, "si"), { target: { value: "4" } });
    expect(input(/Container Count/).className).not.toContain("bad");
  });

  it("resets both documents to the originals from before any review, to be saved", () => {
    mount(shipment({ referenceFields: fields({ shipper: "Reviewed SI" }), extractedFields: fields({ containerCount: "4" }), originalExtractedFields: fields({ containerCount: "9" }) }));
    fireEvent.click(resetButton());
    expect(input(/Shipper/, "si").value).toBe("Meridian Textiles Sdn Bhd");
    expect(input(/Container Count/).value).toBe("9");
    expect(handlers.onToast).toHaveBeenCalledWith("Reset to the original documents. Save Changes to keep it.");
    expect(resetButton().disabled).toBe(true); // already the originals
    fireEvent.click(saveButton());
    expect(handlers.onSave).toHaveBeenCalledWith({ si: fields(), bl: fields({ containerCount: "9" }) });
  });

  it("falls back to the fields the automatic check named when the documents match", () => {
    mount(shipment({ status: "discrepancy", discrepancies: [{ field: "pol", label: "Port of Loading (POL)", si: "a", bl: "b", note: "" }] }));
    expect(input(/POL/).className).toContain("bad");
    fireEvent.change(input(/Shipper/), { target: { value: "Edited" } });
    expect(input(/POL/).className).not.toContain("bad");
  });

  it("disables editing while saving", () => {
    const { rerender } = mount();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    rerender(<ReviewModal shipment={shipment()} saving {...handlers} />);
    expect(input(/Shipper/).disabled).toBe(true);
    expect(within(document.querySelector(".doc-foot") as HTMLElement).getAllByRole("button", { name: "Saving…" }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(resetButton().disabled).toBe(true);
  });

  it("starts over when another email is shown", () => {
    const { rerender } = mount();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    rerender(<ReviewModal shipment={shipment({ id: "email_002", extractedFields: fields({ shipper: "Other" }) })} saving={false} {...handlers} />);
    expect(input(/Shipper/).value).toBe("Other");
  });
});

describe("ReviewModal unsaved changes question", () => {
  const question = () => screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" });

  it("asks before closing, and keeps the edits when told to", () => {
    mount();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(question()!.textContent).toContain("Your changes to the BL have not been saved.");
    expect(handlers.onClose).not.toHaveBeenCalled();
    fireEvent.click(button("Keep Editing"));
    expect(question()).toBeNull();
    expect(input(/Shipper/).value).toBe("Typo");

    fireEvent.click(button("Close"));
    fireEvent.keyDown(document.body, { key: "Escape" }); // Escape answers Keep Editing, it does not close the review
    expect(question()).toBeNull();
    expect(handlers.onClose).not.toHaveBeenCalled();

    fireEvent.click(button("Close"));
    fireEvent.click(button("Discard Changes"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before stepping to another email", () => {
    mount();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    fireEvent.change(input(/Shipper/, "si"), { target: { value: "Typo" } });
    fireEvent.click(button("Next email"));
    expect(question()!.textContent).toContain("Your changes to the SI and BL have not been saved.");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" }); // the arrow keys wait for the answer
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onPrev).not.toHaveBeenCalled();
    fireEvent.click(button("Discard Changes"));
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    expect(question()).toBeNull();
  });

  it("does not ask once the edits are undone", () => {
    mount();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    fireEvent.change(input(/Shipper/), { target: { value: "Meridian Textiles Sdn Bhd" } });
    fireEvent.click(button("Previous email"));
    expect(question()).toBeNull();
    expect(handlers.onPrev).toHaveBeenCalled();
  });
});

describe("ReviewModal plain email", () => {
  const plain = shipment({ category: "invoice", referenceFields: null, extractedFields: null });

  it("shows the whole email with the sender's name", () => {
    mount(plain);
    expect(screen.getByRole("dialog", { name: "Email Transmission email_001" })).toBeTruthy();
    expect(screen.getByText("From: Meridian Ops <ops@meridian.example>")).toBeTruthy();
    expect(screen.getByText("Attached Files")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Side-by-Side Review" })).toBeNull();
    fireEvent.click(button("Mark as Read"));
    expect(handlers.onMarkRead).toHaveBeenCalled();
  });

  it("offers Clear & Validate only on a flagged email without a comparison", () => {
    const flagged = { ...plain, status: "discrepancy" as const, reviewReasons: ["Email classification failed: timeout"] };
    const { rerender } = mount(flagged);
    fireEvent.click(button("Clear & Validate"));
    expect(handlers.onClear).toHaveBeenCalled();
    rerender(<ReviewModal shipment={flagged} saving {...handlers} />);
    expect((button("Clear & Validate") as HTMLButtonElement).disabled).toBe(true);
    for (const [s, readOnly] of [[plain, false], [{ ...flagged, referenceFields: null, category: "document-comparison" }, false], [flagged, true]] as const) {
      rerender(<ReviewModal shipment={s} saving={false} readOnly={readOnly} {...handlers} />);
      expect(screen.queryByRole("button", { name: "Clear & Validate" })).toBeNull();
    }
  });

  it("treats a comparison email without both documents as plain", () => {
    mount(shipment({ referenceFields: null }));
    expect(screen.getByRole("dialog", { name: "Email Transmission email_001" })).toBeTruthy();
  });
});

describe("ReviewModal audit log", () => {
  const log = (id: string) => [{ id: `${id}:classified`, at: "2026-03-20T09:16:00Z", kind: "classified", actor: "n8n Workflow", bot: true, emailId: id, subject: "", detail: "Spam", outcome: "", changes: [] }];
  const tab = () => within(document.querySelector(".modal-actions")!).getByRole("button", { name: "Audit Log" });

  it("shows this email's log from the top row of every email, and goes back", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(log(decodeURIComponent(url.split("email=")[1])))));
    vi.stubGlobal("fetch", fetchMock);
    for (const s of [shipment(), shipment({ category: "invoice", referenceFields: null, extractedFields: null })]) {
      mount(s);
      await act(async () => fireEvent.click(tab()));
      expect(tab().getAttribute("aria-pressed")).toBe("true");
      expect(fetchMock).toHaveBeenLastCalledWith("/api/audit?email=email_001");
      expect(screen.getByRole("list", { name: "Audit Log" }).textContent).toContain("classified email_001 as Spam");
      expect(document.querySelector(".paper, .plain-card")).toBeNull();
      fireEvent.click(within(document.querySelector(".modal-actions")!).getByRole("button", { name: "Read Email" }));
      expect(document.querySelector(".email-card")).toBeTruthy();
      cleanup();
    }
  });

  it("follows the email when stepping", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(log(decodeURIComponent(url.split("email=")[1])))));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = mount();
    await act(async () => fireEvent.click(tab()));
    await act(async () => rerender(<ReviewModal shipment={shipment({ id: "email/2" })} saving={false} {...handlers} />));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/audit?email=email%2F2");
    expect(screen.getByRole("list", { name: "Audit Log" }).textContent).toContain("classified email/2 as Spam");
  });

  it("explains an empty log and a failed load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    mount();
    await act(async () => fireEvent.click(tab()));
    expect(screen.getByText("No activity on this email yet.")).toBeTruthy();
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 502 })));
    mount();
    await act(async () => fireEvent.click(tab()));
    expect(screen.getByText("Could not load the audit log from Firestore.")).toBeTruthy();
  });
});

describe("ReviewModal closing and stepping", () => {
  it("closes from the X, the Close button or Escape", () => {
    const ways = [
      () => fireEvent.click(document.querySelector(".modal-actions .close")!),
      () => fireEvent.click(document.querySelector(".plain-foot .btn")!),
      () => fireEvent.keyDown(document.body, { key: "Escape" }),
    ];
    for (const close of ways) {
      const { unmount } = mount(shipment({ category: "general" }));
      close();
      unmount();
    }
    expect(handlers.onClose).toHaveBeenCalledTimes(3);
  });

  it("plays the exit once before closing", () => {
    vi.useFakeTimers();
    reduced = false;
    mount();
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelector(".overlay")!.className).toContain("closing");
    expect(handlers.onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("steps with the arrow buttons and keys, but not while typing", () => {
    mount();
    fireEvent.click(button("Next email"));
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input(/Shipper/), { key: "ArrowRight" });
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
  });

  it("disables stepping past the ends of the list", () => {
    mount(shipment(), { onPrev: undefined, onNext: undefined });
    expect((button("Previous email") as HTMLButtonElement).disabled).toBe(true);
    expect((button("Next email") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
  });
});

describe("ReviewModal AI reply", () => {
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("generates an editable reply from the email and comparison", async () => {
    const fetchMock = reply({ body: "  Dear Meridian,\nAll good.  " });
    vi.stubGlobal("fetch", fetchMock);
    mount(mismatch);
    toEmail();
    fireEvent.click(button("Generate AI Reply"));
    expect(screen.getByRole("status").textContent).toBe("Generating reply…");
    await act(async () => {});
    const box = screen.getByRole("textbox", { name: "AI Reply" }) as HTMLTextAreaElement;
    expect(box.value).toBe("Dear Meridian,\nAll good.");
    expect(button("Regenerate AI Reply")).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auto-reply");
    const sent = JSON.parse(String(init.body));
    expect(sent.email).toEqual({ id: "email_001", subject: "SI and draft BL for review", sender: "ops@meridian.example", senderName: "Meridian Ops", body: "Please check the attached SI and BL.", category: "SI BL Comparison", attachments: ["email_001_SI.pdf", "email_001_BL.pdf"] });
    expect(sent.comparison).toEqual({ si: fields(), bl: fields({ containerCount: "4" }), discrepancies: [] });
  });

  it("sends no comparison for a plain email", async () => {
    const fetchMock = reply({ body: "Thanks" });
    vi.stubGlobal("fetch", fetchMock);
    mount(shipment({ category: "general" }));
    fireEvent.click(button("Generate AI Reply"));
    await act(async () => {});
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty("comparison");
  });

  it("copies the edited reply", async () => {
    vi.stubGlobal("fetch", reply({ body: "Draft" }));
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    toEmail();
    fireEvent.click(button("Generate AI Reply"));
    await act(async () => {});
    fireEvent.change(screen.getByRole("textbox", { name: "AI Reply" }), { target: { value: "Draft, edited" } });
    await act(async () => fireEvent.click(button("Copy AI Reply")));
    expect(writeText).toHaveBeenCalledWith("Draft, edited");
    expect(handlers.onToast).toHaveBeenCalledWith("Copied AI Reply");
  });

  it("explains when copying is not possible", async () => {
    vi.stubGlobal("fetch", reply({ body: "Draft" }));
    vi.stubGlobal("navigator", {});
    mount();
    toEmail();
    fireEvent.click(button("Generate AI Reply"));
    await act(async () => {});
    await act(async () => fireEvent.click(button("Copy AI Reply")));
    expect(handlers.onToast).toHaveBeenCalledWith("Could not copy — select the text and copy it manually");
  });

  it("reports a failed or empty reply", async () => {
    vi.stubGlobal("fetch", reply({ error: "Could not generate a reply." }, 502));
    mount();
    toEmail();
    fireEvent.click(button("Generate AI Reply"));
    await act(async () => {});
    expect(handlers.onToast).toHaveBeenLastCalledWith("Reply generation failed: Could not generate a reply.");
    expect(screen.queryByRole("textbox", { name: "AI Reply" })).toBeNull();

    vi.stubGlobal("fetch", reply({ body: "  " }));
    fireEvent.click(button("Generate AI Reply"));
    await act(async () => {});
    expect(handlers.onToast).toHaveBeenLastCalledWith("Reply generation failed: n8n returned an empty reply");
  });

  it("cancels a pending reply when another email is shown, without an error", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise((_, reject) => signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const { rerender } = mount();
    toEmail();
    fireEvent.click(button("Generate AI Reply"));
    rerender(<ReviewModal shipment={shipment({ id: "email_002" })} saving={false} {...handlers} />);
    await act(async () => {});
    expect(signal!.aborted).toBe(true);
    expect(handlers.onToast).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
