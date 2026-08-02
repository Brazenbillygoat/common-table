import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MyRecipesPage from "./page";

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";

vi.mock("@/server/auth/session", () => ({
  requireUser: () => Promise.resolve({ user: { id: "trusted-user" } }),
}));
vi.mock("@/server/recipes/list-owned-recipe-drafts", () => ({
  listOwnedRecipeDrafts: () =>
    Promise.resolve([
      { id: recipeId, title: "Chili", version: 1, updatedAt: new Date("2026-07-30T12:00:00Z") },
    ]),
}));

describe("MyRecipesPage", () => {
  it("uses the Edit recipe action without changing its ingredient destination", async () => {
    render(await MyRecipesPage());
    expect(screen.getByRole("link", { name: "Edit recipe" })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/ingredients`,
    );
    expect(screen.queryByText("Continue ingredients")).not.toBeInTheDocument();
  });
});
