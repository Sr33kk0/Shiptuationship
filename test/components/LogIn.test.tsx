import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LogIn from "@/components/LogIn";

const assign = vi.fn();
const fetchMock = vi.fn();
beforeEach(() => {
  assign.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("location", { assign });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function submit() {
  render(<LogIn />);
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "danielho" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LogIn", () => {
  it("sends the username and password, holds the button, and opens the dashboard", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    submit();
    expect((screen.getByRole("button", { name: "Logging in…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/session", expect.objectContaining({ method: "POST", body: JSON.stringify({ username: "danielho", password: "x" }) }));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows why a log in failed and lets you try again", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Wrong username or password" }, { status: 401 }));
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("Wrong username or password");
    expect((screen.getByRole("button", { name: "Log in" }) as HTMLButtonElement).disabled).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a generic message when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("Could not log in. Please try again.");
  });

  it("links back to the front page", () => {
    render(<LogIn />);
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  });
});
