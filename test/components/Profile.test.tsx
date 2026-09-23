import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { logOut } from "@/lib/session";
import Profile from "@/components/Profile";

vi.mock("@/lib/session", () => ({ logOut: vi.fn() }));
const toggle = () => screen.getByRole("button", { name: "Daniel Ho, account menu" });

describe("Profile", () => {
  it("shows the demo moderator", () => {
    render(<Profile />);
    expect(toggle().textContent).toContain("DH");
    expect(toggle().textContent).toContain("Moderator · DanielHo");
  });

  it("opens a menu that logs out", () => {
    render(<Profile />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    expect(logOut).toHaveBeenCalled();
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
