import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "./SiteHeader";
import { MobileNavigation } from "./MobileNavigation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/components/auth/auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
  },
}));

describe("SiteHeader", () => {
  it("shows sign in, theme control, and no sign-out control for a signed-out visitor", async () => {
    render(<SiteHeader viewer={null} />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Recipes" })).toHaveAttribute("href", "/recipes");
    expect(screen.queryByRole("link", { name: "Create Recipe" })).not.toBeInTheDocument();
  });

  it("shows only the signed-in display name, theme control, and sign-out control", async () => {
    const viewer = {
      displayName: "Hyrum",
      email: "hyrum@example.com",
    };

    render(<SiteHeader viewer={viewer} />);

    expect(screen.getByText("Hyrum")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByText("hyrum@example.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("keeps four mobile destinations and replaces Create with Recipes", () => {
    render(<MobileNavigation />);

    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Recipes" })).toHaveAttribute("href", "/recipes");
    expect(screen.queryByRole("link", { name: "Create" })).not.toBeInTheDocument();
  });
});
