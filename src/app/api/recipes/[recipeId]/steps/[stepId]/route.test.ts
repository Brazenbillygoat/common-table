import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
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
  updateRecipeStep: mocks.update,
  deleteRecipeStep: mocks.delete,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const stepId = "e785b35e-4ff4-421b-9609-58b889461279";
const params = Promise.resolve({ recipeId, stepId });
const request = (method: string, body: unknown) =>
  new Request("http://localhost", { method, body: JSON.stringify(body) });

describe("recipe step item routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates and deletes using only the authenticated actor", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.update.mockResolvedValue({
      step: { id: stepId, position: 0, instruction: "Bake." },
      version: 3,
    });
    const updateResponse = await PATCH(
      request("PATCH", { expectedVersion: 2, instruction: " Bake. ", ownerId: "attacker" }),
      { params },
    );
    expect(updateResponse.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      stepId,
      expectedVersion: 2,
      input: { instruction: "Bake." },
    });
    mocks.delete.mockResolvedValue({ deletedStepId: stepId, stepIds: [], version: 4 });
    const deleteResponse = await DELETE(request("DELETE", { expectedVersion: 3 }), { params });
    expect(deleteResponse.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      stepId,
      expectedVersion: 3,
    });
  });

  it("rejects invalid route UUIDs and malformed or invalid bodies before auth", async () => {
    const invalidDelete = await DELETE(request("DELETE", { expectedVersion: 2 }), {
      params: Promise.resolve({ recipeId, stepId: "bad" }),
    });
    expect(invalidDelete.status).toBe(400);
    const invalidPatch = await PATCH(
      request("PATCH", { expectedVersion: 2, instruction: "Bake." }),
      {
        params: Promise.resolve({ recipeId: "bad", stepId }),
      },
    );
    expect(invalidPatch.status).toBe(400);
    const malformedPatch = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: "{" }),
      { params },
    );
    expect(malformedPatch.status).toBe(400);
    const malformedDelete = await DELETE(
      new Request("http://localhost", { method: "DELETE", body: "{" }),
      { params },
    );
    expect(malformedDelete.status).toBe(400);
    const invalidPatchBody = await PATCH(
      request("PATCH", { expectedVersion: 2, instruction: " " }),
      { params },
    );
    expect(invalidPatchBody.status).toBe(400);
    const invalidDeleteBody = await DELETE(request("DELETE", { expectedVersion: 0 }), { params });
    expect(invalidDeleteBody.status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("returns 401 without calling either service", async () => {
    mocks.session.mockResolvedValue(null);
    expect(
      (await PATCH(request("PATCH", { expectedVersion: 2, instruction: "Bake." }), { params }))
        .status,
    ).toBe(401);
    expect((await DELETE(request("DELETE", { expectedVersion: 2 }), { params })).status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("maps known failures safely and hides unexpected details", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.update.mockRejectedValue(new mocks.RecipeStepError("RECIPE_NOT_FOUND"));
    expect(
      (await PATCH(request("PATCH", { expectedVersion: 2, instruction: "Bake." }), { params }))
        .status,
    ).toBe(404);
    mocks.update.mockRejectedValue(new mocks.RecipeStepError("VERSION_CONFLICT"));
    expect(
      (await PATCH(request("PATCH", { expectedVersion: 2, instruction: "Bake." }), { params }))
        .status,
    ).toBe(409);
    mocks.delete.mockRejectedValue(new mocks.RecipeStepError("RECIPE_NOT_FOUND"));
    expect((await DELETE(request("DELETE", { expectedVersion: 2 }), { params })).status).toBe(404);
    mocks.delete.mockRejectedValue(new mocks.RecipeStepError("VERSION_CONFLICT"));
    expect((await DELETE(request("DELETE", { expectedVersion: 2 }), { params })).status).toBe(409);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.update.mockRejectedValue(new Error("private SQL"));
    const updateFailure = await PATCH(
      request("PATCH", { expectedVersion: 2, instruction: "Bake." }),
      { params },
    );
    expect(updateFailure.status).toBe(500);
    expect(await updateFailure.text()).not.toContain("private SQL");
    mocks.delete.mockRejectedValue(new Error("private SQL"));
    const deleteFailure = await DELETE(request("DELETE", { expectedVersion: 2 }), { params });
    expect(deleteFailure.status).toBe(500);
    expect(await deleteFailure.text()).not.toContain("private SQL");
  });
});
