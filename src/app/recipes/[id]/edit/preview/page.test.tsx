import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RecipePreviewPage from "./page";

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOwnedRecipePreview: vi.fn(),
  renderContent: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/recipes/get-owned-recipe-preview", () => ({
  getOwnedRecipePreview: mocks.getOwnedRecipePreview,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("../RecipeEditNavigation", () => ({ RecipeEditNavigation: () => null }));
vi.mock("./RecipePreview", () => ({
  RecipePreview: ({ content }: { content: unknown }) => {
    mocks.renderContent(content);
    return <p>Ingredient and instruction preview</p>;
  },
}));

const preview = {
  recipe: {
    id: recipeId,
    title: "Saved chili title",
    description: "A weeknight favorite.\nUse any bean you like.",
    yieldMin: 4,
    yieldMax: null,
    yieldUnit: "servings",
    version: 3,
  },
  sections: [],
  choiceGroups: [],
  ingredients: [],
  steps: [],
};

describe("RecipePreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ user: { id: "trusted-owner" } });
    mocks.getOwnedRecipePreview.mockResolvedValue(preview);
  });

  it("shows saved details and passes existing authored content through", async () => {
    render(await RecipePreviewPage({ params: Promise.resolve({ id: recipeId }) }));

    expect(mocks.getOwnedRecipePreview).toHaveBeenCalledWith(recipeId, "trusted-owner");
    expect(screen.getByRole("heading", { name: "Saved chili title" })).toBeInTheDocument();
    expect(screen.getByText(/A weeknight favorite/).textContent).toBe(preview.recipe.description);
    expect(screen.getByText("Yield: 4 servings")).toBeInTheDocument();
    expect(mocks.renderContent).toHaveBeenCalledWith(preview);
  });

  it.each([
    { yieldMin: 4, yieldMax: 8, yieldUnit: "bowls", expected: "Yield: 4–8 bowls" },
    {
      yieldMin: 1.125,
      yieldMax: 2.375,
      yieldUnit: "litres",
      expected: "Yield: 1.125–2.375 litres",
    },
    { yieldMin: 1.5, yieldMax: null, yieldUnit: "loaves", expected: "Yield: 1.5 loaves" },
  ])("renders saved yield as $expected", async ({ expected, ...yieldFields }) => {
    mocks.getOwnedRecipePreview.mockResolvedValue({
      ...preview,
      recipe: { ...preview.recipe, ...yieldFields },
    });
    render(await RecipePreviewPage({ params: Promise.resolve({ id: recipeId }) }));

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("omits absent description and yield, including a retained yield unit", async () => {
    mocks.getOwnedRecipePreview.mockResolvedValue({
      ...preview,
      recipe: { ...preview.recipe, description: null, yieldMin: null, yieldMax: null },
    });
    render(await RecipePreviewPage({ params: Promise.resolve({ id: recipeId }) }));

    expect(screen.queryByText(/A weeknight favorite/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Yield:/)).not.toBeInTheDocument();
    expect(screen.queryByText("servings")).not.toBeInTheDocument();
  });

  it("treats unavailable drafts uniformly without rendering content", async () => {
    mocks.getOwnedRecipePreview.mockResolvedValue(null);

    await expect(RecipePreviewPage({ params: Promise.resolve({ id: recipeId }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.renderContent).not.toHaveBeenCalled();
  });

  it("rejects malformed recipe IDs before querying preview data", async () => {
    await expect(RecipePreviewPage({ params: Promise.resolve({ id: "bad-id" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mocks.getOwnedRecipePreview).not.toHaveBeenCalled();
  });

  it("requires a session before reading a private preview", async () => {
    mocks.requireUser.mockRejectedValue(new Error("Sign in required"));

    await expect(RecipePreviewPage({ params: Promise.resolve({ id: recipeId }) })).rejects.toThrow(
      "Sign in required",
    );
    expect(mocks.getOwnedRecipePreview).not.toHaveBeenCalled();
  });
});
