import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnedRecipePreview } from "./get-owned-recipe-preview";

const mocks = vi.hoisted(() => ({ details: vi.fn(), ingredients: vi.fn(), steps: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./get-owned-recipe-details", () => ({ getOwnedRecipeDetails: mocks.details }));
vi.mock("./get-owned-recipe-ingredient-editor", () => ({
  getOwnedRecipeIngredientEditor: mocks.ingredients,
}));
vi.mock("./get-owned-recipe-step-editor", () => ({ getOwnedRecipeStepEditor: mocks.steps }));

const details = {
  id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
  title: "Saved title",
  description: "Saved description",
  yieldMin: 4,
  yieldMax: 8,
  yieldUnit: "bowls",
  version: 2,
};
const sections = [{ id: "section", name: null, position: 0 }];
const choiceGroups = [{ id: "choice-group", sectionId: "section", label: "Oil" }];
const ingredients = [{ id: "ingredient", quantityMin: 2 }];
const steps = [{ id: "step", instruction: "Mix well." }];

describe("getOwnedRecipePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.details.mockResolvedValue(details);
    mocks.ingredients.mockResolvedValue({
      recipe: { id: details.id, title: "Earlier title", version: 1 },
      sections,
      choiceGroups,
      lines: ingredients,
      ingredientOptions: [{ id: "reference-only" }],
      unitOptions: [],
    });
    mocks.steps.mockResolvedValue({ recipe: { id: details.id }, steps, conditionOptions: [] });
  });

  it("combines safe saved details with unchanged authored ingredients and steps", async () => {
    const preview = await getOwnedRecipePreview(details.id, "trusted-owner");

    expect(preview).toEqual({ recipe: details, sections, choiceGroups, ingredients, steps });
    expect(preview?.ingredients).toBe(ingredients);
    expect(preview?.steps).toBe(steps);
    for (const getter of Object.values(mocks)) {
      expect(getter).toHaveBeenCalledWith(details.id, "trusted-owner");
    }
  });

  it.each(["details", "ingredients", "steps"] as const)(
    "returns no preview when the owner-scoped %s read is unavailable",
    async (key) => {
      mocks[key].mockResolvedValue(null);
      await expect(getOwnedRecipePreview(details.id, "other-owner")).resolves.toBeNull();
    },
  );
});
