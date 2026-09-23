import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { logIn } from "@/lib/session";
import LogInButton from "@/components/LogInButton";

vi.mock("@/lib/session", () => ({ logIn: vi.fn() }));

describe("LogInButton", () => {
  it("logs in when clicked", () => {
    render(<LogInButton className="site-btn">Log in</LogInButton>);
    const button = screen.getByRole("button", { name: "Log in" });
    expect(button.className).toBe("site-btn");
    fireEvent.click(button);
    expect(logIn).toHaveBeenCalledTimes(1);
  });
});
