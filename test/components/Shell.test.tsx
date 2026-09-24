import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Shell, { NavLink, useNavigate, useToast } from "@/components/Shell";

let pathname = "/dashboard";
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));

let mobile = false;
let reduced = false;
beforeEach(() => {
  pathname = "/dashboard";
  mobile = reduced = false;
  push.mockClear();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q) => ({ matches: q.includes("max-width") ? mobile : reduced, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Page() {
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => toast("Saved!")}>toast</button>
      <button onClick={() => navigate("/emails?view=spam")}>go</button>
    </>
  );
}
const mount = () => render(<Shell><Page /></Shell>);
const link = (name: string) => screen.getAllByRole("link", { name })[0];
const shell = () => document.querySelector(".shell")!;
const main = () => document.querySelector("main")!;

describe("Shell", () => {
  it("lists every page and marks the current one", () => {
    pathname = "/audit/user";
    mount();
    for (const name of ["Dashboard Overview", "Emails", "Shipments", "User Log", "System Log", "Settings"]) expect(link(name)).toBeTruthy();
    expect(link("User Log").getAttribute("aria-current")).toBe("page");
    expect(link("User Log").className).toContain("active");
    expect(link("Emails").getAttribute("aria-current")).toBeNull();
  });

  it("fades the page out before moving to another one", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(link("Emails"));
    expect(main().className).toContain("leaving");
    expect(link("Emails").className).toContain("active"); // the highlight moves straight away
    expect(push).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(120));
    expect(push).toHaveBeenCalledWith("/emails");
  });

  it("moves at once with reduced motion", () => {
    reduced = true;
    mount();
    fireEvent.click(link("Emails"));
    expect(push).toHaveBeenCalledWith("/emails");
    expect(main().className).not.toContain("leaving");
  });

  it("does not fade a query change on the same page", () => {
    pathname = "/emails";
    mount();
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(push).toHaveBeenCalledWith("/emails?view=spam");
    expect(main().className).not.toContain("leaving");
  });

  it("leaves modifier clicks to the browser", () => {
    mount();
    fireEvent.click(link("Emails"), { ctrlKey: true });
    fireEvent.click(link("Emails"), { button: 1 });
    expect(main().className).not.toContain("leaving");
  });

  it("clears the fade once the new page arrives", () => {
    vi.useFakeTimers();
    const { rerender } = mount();
    fireEvent.click(link("Emails"));
    pathname = "/emails";
    rerender(<Shell><Page /></Shell>);
    expect(main().className).not.toContain("leaving");
    expect(link("Emails").getAttribute("aria-current")).toBe("page");
  });

  it("collapses the sidebar to icons", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(shell().className).toContain("collapsed");
    expect(screen.queryByText("Menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(shell().className).not.toContain("collapsed");
  });

  it("opens the menu as a drawer on small screens", () => {
    mobile = true;
    mount();
    const sidebar = document.getElementById("sidebar")!;
    expect(sidebar.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(shell().className).not.toContain("collapsed"); // the drawer always shows labels

    const open = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(open);
    expect(shell().className).toContain("drawer-open");
    expect(open.getAttribute("aria-expanded")).toBe("true");
    expect(sidebar.hasAttribute("inert")).toBe(false);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(shell().className).not.toContain("drawer-open");
    fireEvent.click(open);
    fireEvent.click(document.querySelector(".backdrop")!);
    expect(shell().className).not.toContain("drawer-open");
    fireEvent.click(open);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(shell().className).not.toContain("drawer-open");
  });

  it("shows a toast for three seconds", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "toast" }));
    expect(screen.getByRole("status").textContent).toBe("Saved!");
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("NavLink", () => {
  it("runs its own onClick and respects a cancelled click", () => {
    reduced = true;
    const onClick = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(<Shell><NavLink href="/settings" onClick={onClick}>custom</NavLink></Shell>);
    fireEvent.click(screen.getByRole("link", { name: "custom" }));
    expect(onClick).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
