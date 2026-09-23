import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Landing from "@/components/Landing";

describe("Landing", () => {
  it("introduces the product", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Catch the mismatch before the ship sails.");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
  });

  it("links to each section on the page", () => {
    render(<Landing />);
    const nav = screen.getByRole("navigation", { name: "Page sections" });
    const targets = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(targets).toEqual(["#how", "#compare", "#features"]);
    for (const t of targets) expect(document.querySelector(t!)).not.toBeNull();
  });

  it("shows the sample comparison with the one mismatch", () => {
    render(<Landing />);
    const sample = screen.getByRole("figure");
    expect(sample.textContent).toContain("Container Count (3 on SI vs 4 on Draft BL)");
    expect(sample.querySelectorAll(".paper")).toHaveLength(2);
    expect(sample.querySelector(".site-mark")!.textContent).toBe("4 x 40HC");
  });

  it("lists the seven compared fields and the five steps", () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll(".site-fields li")).toHaveLength(7);
    expect(container.querySelectorAll(".site-steps li")).toHaveLength(5);
  });

  it("sends every call to action to the log in page", () => {
    render(<Landing />);
    const links = screen.getAllByRole("link", { name: /Log in/ });
    expect(links).toHaveLength(3);
    for (const l of links) expect(l.getAttribute("href")).toBe("/login");
  });
});
