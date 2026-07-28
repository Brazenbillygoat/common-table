import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/server/recipes/manage-recipe-ingredients", () => ({
  RecipeIngredientError: class RecipeIngredientError extends Error {},
  updateRecipeIngredientLine: mocks.update,
  deleteRecipeIngredientLine: mocks.delete,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const ingredientId = "e785b35e-4ff4-421b-9609-58b889461279";
const params = Promise.resolve({ recipeId, ingredientId });
const input = {
  expectedVersion: 2,
  ingredientSource: "custom",
  ingredientId: "",
  customIngredient: "Chile crisp",
  quantityMode: "text",
  quantityMin: "",
  quantityMax: "",
  quantityText: "to taste",
  unitSource: "none",
  unitId: "",
  customUnit: "",
  preparationNote: "",
  isOptional: false,
};

function request(method: string, body: unknown) {
  return new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
  });
}

describe("ingredient item routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates with the authenticated actor", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.update.mockResolvedValue({ line: { id: ingredientId }, version: 3 });
    const response = await PATCH(request("PATCH", input), { params });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "trusted-user",
        recipeId,
        ingredientId,
        expectedVersion: 2,
      }),
    );
  });

  it("deletes with only an expected version", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.delete.mockResolvedValue({
      deletedIngredientId: ingredientId,
      ingredientIds: [],
      version: 3,
    });
    const response = await DELETE(request("DELETE", { expectedVersion: 2 }), {
      params,
    });
    expect(response.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      ingredientId,
      expectedVersion: 2,
    });
  });

  it("rejects an invalid ingredient route UUID before auth", async () => {
    const response = await DELETE(request("DELETE", { expectedVersion: 2 }), {
      params: Promise.resolve({ recipeId, ingredientId: "bad" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
