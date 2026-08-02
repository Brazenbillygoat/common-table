import { beforeEach, describe, expect, it, vi } from "vitest";

import { PUT } from "./route";

const mocks = vi.hoisted(() => ({
  reorder: vi.fn(),
  session: vi.fn(),
  RecipeStepError: class RecipeStepError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));
vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/server/recipes/manage-recipe-steps", () => ({
  RecipeStepError: mocks.RecipeStepError,
  reorderRecipeSteps: mocks.reorder,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const firstId = "e785b35e-4ff4-421b-9609-58b889461279";
const secondId = "c62ec57a-7ef4-470c-ae03-10a74b8aabf2";
const request = (body: unknown) =>
  new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) });

describe("PUT recipe step order", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid IDs, malformed JSON, and duplicate step IDs before auth", async () => {
    expect(
      (
        await PUT(request({ expectedVersion: 2, stepIds: [] }), {
          params: Promise.resolve({ recipeId: "bad" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await PUT(new Request("http://localhost", { method: "PUT", body: "{" }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(400);
    const duplicate = await PUT(request({ expectedVersion: 2, stepIds: [firstId, firstId] }), {
      params: Promise.resolve({ recipeId }),
    });
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toEqual({
      error: { code: "VALIDATION_ERROR", fieldErrors: { stepIds: ["Step IDs must be unique."] } },
    });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("authenticates and maps the complete set result", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.reorder.mockResolvedValue({ stepIds: [secondId, firstId], version: 3 });
    const response = await PUT(
      request({ expectedVersion: 2, stepIds: [secondId, firstId], ownerId: "attacker" }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { stepIds: [secondId, firstId], version: 3 },
    });
    expect(mocks.reorder).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      expectedVersion: 2,
      stepIds: [secondId, firstId],
    });
  });

  it("returns 401 and maps invalid sets, conflicts, and unexpected failures safely", async () => {
    mocks.session.mockResolvedValue(null);
    expect(
      (
        await PUT(request({ expectedVersion: 2, stepIds: [] }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.reorder.mockRejectedValue(new mocks.RecipeStepError("STEP_SET_INVALID"));
    expect(
      (
        await PUT(request({ expectedVersion: 2, stepIds: [] }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(400);
    mocks.reorder.mockRejectedValue(new mocks.RecipeStepError("RECIPE_NOT_FOUND"));
    expect(
      (
        await PUT(request({ expectedVersion: 2, stepIds: [] }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(404);
    mocks.reorder.mockRejectedValue(new mocks.RecipeStepError("VERSION_CONFLICT"));
    expect(
      (
        await PUT(request({ expectedVersion: 2, stepIds: [] }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(409);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.reorder.mockRejectedValue(new Error("private SQL"));
    const response = await PUT(request({ expectedVersion: 2, stepIds: [] }), {
      params: Promise.resolve({ recipeId }),
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private SQL");
  });
});
