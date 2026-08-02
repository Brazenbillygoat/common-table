import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

function createMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((type: string, listener: (event: MediaQueryListEvent) => void) => {
      if (type === "change") listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: MediaQueryListEvent) => void) => {
      if (type === "change") listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  return {
    matchMedia: vi.fn(() => mediaQuery),
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) =>
        listener({ matches: nextMatches, media: mediaQuery.media } as MediaQueryListEvent),
      );
    },
  };
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("uses the operating-system preference when no stored preference exists", async () => {
    const media = createMatchMedia(true);
    vi.stubGlobal("matchMedia", media.matchMedia);

    const { container } = render(<ThemeToggle />);

    expect(await screen.findByRole("button", { name: "Switch to light mode" })).toBeEnabled();
    expect(container.querySelector('[data-theme-icon="sun"]')).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("lets a valid stored preference override the operating system", async () => {
    window.localStorage.setItem("common-table-theme", "light");
    const media = createMatchMedia(true);
    vi.stubGlobal("matchMedia", media.matchMedia);

    const { container } = render(<ThemeToggle />);

    expect(await screen.findByRole("button", { name: "Switch to dark mode" })).toBeEnabled();
    expect(container.querySelector('[data-theme-icon="moon"]')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("ignores unknown storage and follows the operating system", async () => {
    window.localStorage.setItem("common-table-theme", "sepia");
    const media = createMatchMedia(true);
    vi.stubGlobal("matchMedia", media.matchMedia);

    render(<ThemeToggle />);

    expect(await screen.findByRole("button", { name: "Switch to light mode" })).toBeEnabled();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("falls back safely when storage is inaccessible", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const media = createMatchMedia(false);
    vi.stubGlobal("matchMedia", media.matchMedia);

    render(<ThemeToggle />);

    expect(await screen.findByRole("button", { name: "Switch to dark mode" })).toBeEnabled();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });

  it("toggles the theme, accessible action, visible symbol, and storage", async () => {
    const media = createMatchMedia(false);
    vi.stubGlobal("matchMedia", media.matchMedia);
    const { container } = render(<ThemeToggle />);
    const button = await screen.findByRole("button", { name: "Switch to dark mode" });

    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeEnabled();
    expect(container.querySelector('[data-theme-icon="sun"]')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("common-table-theme")).toBe("dark");
  });

  it("tracks operating-system changes only until the user makes an explicit choice", async () => {
    const media = createMatchMedia(false);
    vi.stubGlobal("matchMedia", media.matchMedia);
    render(<ThemeToggle />);
    await screen.findByRole("button", { name: "Switch to dark mode" });

    act(() => media.setMatches(true));
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeEnabled();

    act(() => media.setMatches(true));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeEnabled(),
    );
  });
});
