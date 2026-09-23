import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Profile, { ModeratorProvider } from "@/components/Profile";

const render = (el: React.ReactElement) => rtlRender(<ModeratorProvider value={{ id: "DanielHo", name: "Daniel Ho" }}>{el}</ModeratorProvider>);
afterEach(() => {
  vi.unstubAllGlobals();
});
const toggle = () => screen.getByRole("button", { name: "Daniel Ho, account menu" });

describe("Profile", () => {
  it("shows the logged-in moderator", () => {
    render(<Profile />);
    expect(toggle().textContent).toContain("DH");
    expect(toggle().textContent).toContain("Moderator · DanielHo");
  });

  it("opens a menu that logs out and returns to the front page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const assign = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign });
    render(<Profile />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/session", { method: "DELETE" });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("closes on Escape, a click outside or the toggle", () => {
    render(<Profile />);
    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(toggle());
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
