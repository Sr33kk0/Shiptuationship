import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { printEmail } from "@/lib/printEmail";
import type { Shipment } from "@/lib/shipments";
import { fields, shipment } from "@/test/fixtures";
import ReviewModal from "@/components/ReviewModal";

vi.mock("@/lib/printEmail", () => ({ printEmail: vi.fn() }));

type Props = ComponentProps<typeof ReviewModal>;
type Handlers = { [K in "onClose" | "onSave" | "onMarkRead" | "onToast"]: Mock<Props[K]> } & { onPrev?: Mock<() => void>; onNext?: Mock<() => void> };

let reduced = true;
let handlers: Handlers;
beforeEach(() => {
  reduced = true;
  handlers = { onClose: vi.fn(), onSave: vi.fn(), onMarkRead: vi.fn(), onToast: vi.fn(), onPrev: vi.fn(), onNext: vi.fn() };
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
const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const toSideBySide = () => fireEvent.click(within(document.querySelector(".modal-actions")!).getByRole("button", { name: "Side-by-Side Review" }));
const toEmail = () => fireEvent.click(within(document.querySelector(".modal-actions")!).getByRole("button", { name: "Read Email" }));
const docBar = () => within(document.querySelector(".doc-bar") as HTMLElement);
const formSide = () => within(document.querySelector(".form-side") as HTMLElement);
const paperValue = (kind: "si" | "bl", n: number) => document.querySelectorAll(`.paper.${kind} .v`)[n];
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

  it("marks as read, and shows the read and saving states", () => {
    const { rerender } = mount();
    fireEvent.click(button("Mark as Read"));
    expect(handlers.onMarkRead).toHaveBeenCalled();
    rerender(<ReviewModal shipment={shipment()} saving {...handlers} />);
    expect((within(document.querySelector(".modal-actions")!).getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ReviewModal shipment={shipment({ isRead: true })} saving={false} {...handlers} />);
    expect((button("Read") as HTMLButtonElement).disabled).toBe(true);
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
    expect(document.querySelector(".form-pane")).not.toBeNull();
  });
});

describe("ReviewModal side-by-side review", () => {
  it("edits the draft BL by default and saves the form", () => {
    mount();
    toSideBySide();
    expect(input(/Shipper/).value).toBe("Meridian Textiles Sdn Bhd");
    fireEvent.change(input(/Container Count/), { target: { value: "5" } });
    fireEvent.click(button("Save BL Changes"));
    expect(handlers.onSave).toHaveBeenCalledWith("bl", fields({ containerCount: "5" }));
  });

  it("marks live differences on the document being edited only", () => {
    mount();
    toSideBySide();
    fireEvent.change(input(/Container Count/), { target: { value: "4" } });
    expect(input(/Container Count/).className).toBe("bad");
    expect(input(/Container Count/).closest(".field")!.textContent).toContain("SI: 3 units");
    expect(paperValue("bl", 5).className).toContain("bad");
    expect(paperValue("si", 5).className).not.toContain("bad");
    expect(paperValue("bl", 5).textContent).toBe("4 x 40HC");
    expect(paperValue("bl", 6).textContent).toBe("22000 kg");
  });

  it("resets the form to the saved values", () => {
    mount();
    toSideBySide();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    fireEvent.click(button(/Reset/));
    expect(input(/Shipper/).value).toBe("Meridian Textiles Sdn Bhd");
    expect(handlers.onToast).toHaveBeenCalledWith("Reset BL fields to their last saved values");
  });

  it("switches to editing the SI, discarding unsaved BL edits", () => {
    mount(mismatch);
    toSideBySide();
    expect(input(/Container Count/).value).toBe("4");
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    fireEvent.click(formSide().getByRole("button", { name: "Customer SI" }));
    expect(handlers.onToast).toHaveBeenCalledWith("Discarded unsaved BL edits");
    expect(input(/Container Count/).value).toBe("3");
    expect(input(/Container Count/).closest(".field")!.textContent).toContain("BL: 4 units");
    expect(paperValue("si", 5).className).toContain("bad");
    expect(paperValue("bl", 5).className).not.toContain("bad");
    fireEvent.click(button("Save SI Changes"));
    expect(handlers.onSave).toHaveBeenCalledWith("si", fields());
    fireEvent.click(formSide().getByRole("button", { name: "Customer SI" }));
    expect(handlers.onToast).toHaveBeenCalledTimes(1); // same side: nothing to discard
  });

  it("falls back to the fields the automatic check named when the documents match", () => {
    mount(shipment({ status: "discrepancy", discrepancies: [{ field: "pol", label: "Port of Loading (POL)", si: "a", bl: "b", note: "" }] }));
    toSideBySide();
    expect(input(/Port of Loading/).className).toBe("bad");
    fireEvent.change(input(/Shipper/), { target: { value: "Edited" } });
    expect(input(/Port of Loading/).className).toBe("");
  });

  it("disables the form while saving", () => {
    mount(shipment(), { saving: true });
    toSideBySide();
    expect(input(/Shipper/).disabled).toBe(true);
    expect((within(document.querySelector(".form-foot") as HTMLElement).getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows one document at a time or both, and can hide the form", () => {
    mount();
    toSideBySide();
    fireEvent.click(docBar().getByRole("button", { name: "Customer SI" }));
    expect(document.querySelectorAll(".paper")).toHaveLength(1);
    expect(document.querySelector(".paper.si")).not.toBeNull();
    fireEvent.click(docBar().getByRole("button", { name: "Carrier Draft BL" }));
    expect(document.querySelector(".paper.bl")).not.toBeNull();
    fireEvent.click(docBar().getByRole("button", { name: "Side-by-Side" }));
    expect(document.querySelectorAll(".paper")).toHaveLength(2);

    fireEvent.click(button("Maximize Document Space"));
    expect(document.querySelector(".form-pane")).toBeNull();
    fireEvent.click(button("Show Edit Form"));
    expect(document.querySelector(".form-pane")).not.toBeNull();
  });

  it("starts over when another email is shown", () => {
    const { rerender } = mount();
    toSideBySide();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    rerender(<ReviewModal shipment={shipment({ id: "email_002", extractedFields: fields({ shipper: "Other" }) })} saving={false} {...handlers} />);
    expect(input(/Shipper/).value).toBe("Other");
    expect(document.querySelector(".form-pane")).not.toBeNull(); // the pane stays open
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

  it("treats a comparison email without both documents as plain", () => {
    mount(shipment({ referenceFields: null }));
    expect(screen.getByRole("dialog", { name: "Email Transmission email_001" })).toBeTruthy();
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
    toSideBySide();
    fireEvent.keyDown(input(/Shipper/), { key: "ArrowRight" });
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
  });

  it("warns that stepping discards unsaved edits", () => {
    mount();
    toSideBySide();
    fireEvent.change(input(/Shipper/), { target: { value: "Typo" } });
    fireEvent.click(button("Previous email"));
    expect(handlers.onToast).toHaveBeenCalledWith("Discarded unsaved BL edits");
    expect(handlers.onPrev).toHaveBeenCalled();
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
