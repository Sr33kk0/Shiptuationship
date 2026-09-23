import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LogInButton from "@/components/LogInButton";

describe("LogInButton", () => {
  it("links to the log in page", () => {
    render(<LogInButton className="site-btn">Log in</LogInButton>);
    const link = screen.getByRole("link", { name: "Log in" });
    expect(link.className).toBe("site-btn");
    expect(link.getAttribute("href")).toBe("/login");
  });
});
