import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { logIn } from "@/lib/session";
import LogIn from "@/components/LogIn";

vi.mock("@/lib/session", () => ({ logIn: vi.fn() }));

describe("LogIn", () => {
  it("logs in on submit and holds the button while it does", () => {
    render(<LogIn />);
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "a@b.co" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(logIn).toHaveBeenCalledTimes(1);
    const button = screen.getByRole("button", { name: "Logging in…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("links back to the front page", () => {
    render(<LogIn />);
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  });
});
