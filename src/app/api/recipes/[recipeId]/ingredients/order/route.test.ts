import { describe, expect, it, vi } from "vitest";

import { PUT } from "./route";

const mocks = vi.hoisted(() => ({ reorder: vi.fn(), session: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/server/recipes/manage-recipe-ingredients", () => ({
  RecipeIngredientError: class RecipeIngredientError extends Error {},
  reorderRecipeIngredientLines: mocks.reorder,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const ingredientId = "e785b35e-4ff4-421b-9609-58b889461279";

describe("PUT ingredient order", () => {
  it("rejects duplicate IDs", async () => {
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: 2,
          ingredientIds: [ingredientId, ingredientId],
        }),
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.reorder).not.toHaveBeenCalled();
  });
});
