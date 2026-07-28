import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  session: vi.fn(),
  RecipeIngredientError: class RecipeIngredientError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/server/recipes/manage-recipe-ingredients", () => ({
  RecipeIngredientError: mocks.RecipeIngredientError,
  createRecipeIngredientLine: mocks.create,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const canonicalId = "e785b35e-4ff4-421b-9609-58b889461279";
const body = {
  expectedVersion: 1,
  ingredientSource: "canonical",
  ingredientId: canonicalId,
  customIngredient: "",
  quantityMode: "none",
  quantityMin: "",
  quantityMax: "",
  quantityText: "",
  unitSource: "none",
  unitId: "",
  customUnit: "",
  preparationNote: "",
  isOptional: false,
};

function request(value: unknown = body) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(value),
  });
}

describe("POST ingredient line", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects malformed JSON and invalid route IDs", async () => {
    const malformed = await POST(new Request("http://localhost", { method: "POST", body: "{" }), {
      params: Promise.resolve({ recipeId }),
    });
    expect(malformed.status).toBe(400);
    const invalid = await POST(request(), {
      params: Promise.resolve({ recipeId: "bad" }),
    });
    expect(invalid.status).toBe(400);
  });

  it("returns JSON 401 without calling the service", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST(request(), {
      params: Promise.resolve({ recipeId }),
    });
    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses only the authenticated actor and returns a safe 201", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    const result = { line: { id: canonicalId }, version: 2 };
    mocks.create.mockResolvedValue(result);
    const response = await POST(request({ ...body, ownerId: "attacker" }), {
      params: Promise.resolve({ recipeId }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: result });
    expect(mocks.create).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      expectedVersion: 1,
      input: expect.objectContaining({ ingredientId: canonicalId }),
    });
  });

  it.each([
    ["RECIPE_NOT_FOUND", 404],
    ["VERSION_CONFLICT", 409],
    ["INGREDIENT_UNAVAILABLE", 400],
  ] as const)("maps %s safely", async (code, status) => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.create.mockRejectedValue(new mocks.RecipeIngredientError(code));
    const response = await POST(request(), {
      params: Promise.resolve({ recipeId }),
    });
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("trusted-user");
  });

  it("hides unexpected failure details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.create.mockRejectedValue(new Error("private SQL"));
    const response = await POST(request(), {
      params: Promise.resolve({ recipeId }),
    });
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("private SQL");
  });
});
