import { beforeEach, describe, expect, it, vi } from "vitest";

import { PUT } from "./route";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  session: vi.fn(),
  RecipeIngredientError: class RecipeIngredientError extends Error {
    constructor(
      readonly code: string,
      readonly details?: { linkedSteps?: unknown[] },
    ) {
      super(code);
    }
  },
}));

vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/server/recipes/manage-recipe-ingredient-structure", () => ({
  mutateRecipeIngredientStructure: mocks.mutate,
}));
vi.mock("@/server/recipes/manage-recipe-ingredients", () => ({
  RecipeIngredientError: mocks.RecipeIngredientError,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const sectionId = "e785b35e-4ff4-421b-9609-58b889461279";

function request(value: unknown) {
  return new Request("http://localhost", {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

describe("PUT ingredient structure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates route and nested action data before authentication", async () => {
    expect(
      (
        await PUT(
          request({ expectedVersion: 1, action: { type: "addSection", name: "Filling" } }),
          {
            params: Promise.resolve({ recipeId: "bad" }),
          },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(request({ expectedVersion: 1, action: { type: "addSection", name: " " } }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("derives the actor from the session and passes only the validated action", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.mutate.mockResolvedValue({ version: 3 });
    const response = await PUT(
      request({
        expectedVersion: 2,
        ownerId: "attacker",
        action: { type: "renameSection", sectionId, name: " Filling " },
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      expectedVersion: 2,
      action: { type: "renameSection", sectionId, name: "Filling" },
    });
  });

  it("returns accessible linked-step details without exposing private failure details", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    const linkedSteps = [{ id: "step", position: 1, instruction: "Cook tofu." }];
    mocks.mutate.mockRejectedValue(
      new mocks.RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps }),
    );
    const response = await PUT(
      request({
        expectedVersion: 2,
        action: { type: "deleteSection", sectionId, disposition: "delete" },
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "CONTENT_REFERENCED",
        message:
          "Reassign or delete the linked instruction blocks before changing this ingredient structure.",
        linkedSteps,
      },
    });
  });
});
