import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MyRecipesPage from "./page";

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const mocks = vi.hoisted(() => ({ listOwnedRecipeDrafts: vi.fn() }));
const draft = {
  id: recipeId,
  title: "Chili",
  version: 1,
  status: "draft",
  slug: "chili",
  unpublishedChanges: false,
  updatedAt: new Date("2026-07-30T12:00:00Z"),
};

vi.mock("@/server/auth/session", () => ({
  requireUser: () => Promise.resolve({ user: { id: "trusted-user" } }),
}));
vi.mock("@/server/recipes/list-owned-recipe-drafts", () => ({
  listOwnedRecipeDrafts: mocks.listOwnedRecipeDrafts,
}));

describe("MyRecipesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listOwnedRecipeDrafts.mockResolvedValue([draft]);
  });
  it("opens existing drafts at Details and shows their saved title", async () => {
    render(await MyRecipesPage());
    expect(screen.getByRole("link", { name: "Edit recipe" })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/details`,
    );
    expect(screen.getByRole("heading", { name: "Chili" })).toBeInTheDocument();
    expect(screen.queryByText("Continue ingredients")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preview and publish" })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/preview`,
    );
    expect(screen.queryByRole("link", { name: "View public recipe" })).not.toBeInTheDocument();
    expect(mocks.listOwnedRecipeDrafts).toHaveBeenCalledWith("trusted-user");
  });

  it("shows published recipes and identifies private changes with editing and public links", async () => {
    mocks.listOwnedRecipeDrafts.mockResolvedValue([
      draft,
      {
        ...draft,
        id: "soup-id",
        title: "Private soup title",
        slug: "original-soup",
        status: "published",
        unpublishedChanges: true,
      },
      { ...draft, id: "bread-id", title: "Bread", slug: "bread", status: "published" },
    ]);
    render(await MyRecipesPage());
    const soup = within(screen.getByRole("heading", { name: "Private soup title" }).closest("li")!);
    expect(soup.getByText("Published · Unpublished changes")).toBeInTheDocument();
    expect(soup.getByRole("link", { name: "Edit recipe" })).toHaveAttribute(
      "href",
      "/recipes/soup-id/edit/details",
    );
    expect(soup.getByRole("link", { name: "View public recipe" })).toHaveAttribute(
      "href",
      "/r/original-soup",
    );
    const bread = within(screen.getByRole("heading", { name: "Bread" }).closest("li")!);
    expect(bread.getByText("Published")).toBeInTheDocument();
    expect(bread.queryByText(/Unpublished changes/)).not.toBeInTheDocument();
  });

  it("provides a recipe creation link when the workspace is empty", async () => {
    mocks.listOwnedRecipeDrafts.mockResolvedValue([]);
    render(await MyRecipesPage());
    expect(screen.getByRole("heading", { name: "No recipes yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a recipe" })).toHaveAttribute(
      "href",
      "/recipes/new",
    );
  });
});
