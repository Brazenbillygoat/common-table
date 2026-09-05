import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeDetailsError } from "@/server/recipes/update-recipe-details";

import { GET, PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getOwnedRecipeDetails: vi.fn(),
  updateRecipeDetails: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.getCurrentSession }));
vi.mock("@/server/recipes/get-owned-recipe-details", () => ({
  getOwnedRecipeDetails: mocks.getOwnedRecipeDetails,
}));
vi.mock("@/server/recipes/update-recipe-details", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/recipes/update-recipe-details")>();
  return { ...original, updateRecipeDetails: mocks.updateRecipeDetails };
});

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const context = { params: Promise.resolve({ recipeId }) };
const body = {
  title: " Chili ",
  description: " Family favorite ",
  yieldMin: "4",
  yieldMax: "8",
  yieldUnit: " bowls ",
  expectedVersion: 3,
};
const saved = {
  id: recipeId,
  title: "Chili",
  description: "Family favorite",
  yieldMin: 4,
  yieldMax: 8,
  yieldUnit: "bowls",
  version: 4,
};
const url = `http://localhost/api/recipes/${recipeId}/details`;

function request(value: unknown = body) {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("owner draft details API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "trusted-owner", email: "private@example.invalid" },
      session: { token: "private-session-value" },
    });
  });

  it("reads safe draft details using the session identity and prevents shared caching", async () => {
    mocks.getOwnedRecipeDetails.mockResolvedValue(saved);
    const response = await GET(new Request(url), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ recipe: saved });
    expect(mocks.getOwnedRecipeDetails).toHaveBeenCalledWith(recipeId, "trusted-owner");
  });

  it("rejects both reads and writes without a session", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    for (const response of [
      await GET(new Request(url), context),
      await PATCH(request(), context),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "AUTH_REQUIRED",
          message: "Your session expired. Sign in again to continue.",
        },
      });
    }
    expect(mocks.getOwnedRecipeDetails).not.toHaveBeenCalled();
    expect(mocks.updateRecipeDetails).not.toHaveBeenCalled();
  });

  it("uses one unavailable response for missing, unauthorized, nondraft, and malformed IDs", async () => {
    mocks.getOwnedRecipeDetails.mockResolvedValue(null);
    mocks.updateRecipeDetails.mockRejectedValue(new RecipeDetailsError("RECIPE_NOT_FOUND"));
    const invalidContext = { params: Promise.resolve({ recipeId: "invalid" }) };
    for (const response of [
      await GET(new Request(url), context),
      await PATCH(request(), context),
      await GET(new Request(url), invalidContext),
      await PATCH(request(), invalidContext),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "RECIPE_NOT_FOUND", message: "This recipe draft is not available." },
      });
    }
    expect(mocks.getOwnedRecipeDetails).toHaveBeenCalledOnce();
    expect(mocks.updateRecipeDetails).toHaveBeenCalledOnce();
  });

  it("rejects malformed JSON, invalid ranges, and invalid save counters before mutation", async () => {
    const malformed = await PATCH(new Request(url, { method: "PATCH", body: "{" }), context);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      error: { code: "VALIDATION_ERROR", fieldErrors: {} },
    });
    const invalid = await PATCH(request({ ...body, yieldMax: "2" }), context);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: {
          yieldMax: ["Enter an ending yield greater than or equal to the starting yield."],
        },
      },
    });
    for (const expectedVersion of [0, -1, 1.5, "3", null]) {
      expect((await PATCH(request({ ...body, expectedVersion }), context)).status).toBe(400);
    }
    expect(mocks.updateRecipeDetails).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("saves with trusted ownership and refreshes the list and all four editor destinations", async () => {
    mocks.updateRecipeDetails.mockResolvedValue(saved);
    const response = await PATCH(
      request({ ...body, ownerId: "attacker", status: "published", slug: "replacement" }),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recipe: saved });
    expect(mocks.updateRecipeDetails).toHaveBeenCalledWith({
      actorUserId: "trusted-owner",
      recipeId,
      expectedVersion: 3,
      input: { ...body, title: "Chili", description: "Family favorite", yieldUnit: "bowls" },
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/recipes"],
      [`/recipes/${recipeId}/edit/details`],
      [`/recipes/${recipeId}/edit/ingredients`],
      [`/recipes/${recipeId}/edit/instructions`],
      [`/recipes/${recipeId}/edit/preview`],
    ]);
  });

  it("returns a conflict without revalidating or exposing the current private draft", async () => {
    mocks.updateRecipeDetails.mockRejectedValue(new RecipeDetailsError("VERSION_CONFLICT"));
    const response = await PATCH(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "VERSION_CONFLICT",
        message: "This draft changed elsewhere. Reload it before continuing.",
      },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("hides unexpected failure details in responses and logs, including session failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const privateError = new Error("private database or session detail");
      mocks.getOwnedRecipeDetails.mockRejectedValue(privateError);
      mocks.updateRecipeDetails.mockRejectedValue(privateError);
      const responses = [await GET(new Request(url), context), await PATCH(request(), context)];
      mocks.getCurrentSession.mockRejectedValue(privateError);
      responses.push(await GET(new Request(url), context));
      for (const response of responses) {
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: {
            code: "DETAILS_REQUEST_FAILED",
            message: "We couldn't load or save this draft.",
          },
        });
      }
      expect(log).toHaveBeenCalledTimes(3);
      expect(log).toHaveBeenCalledWith("Recipe details request failed.", {
        classification: "unexpected",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private database");
      expect(JSON.stringify(log.mock.calls)).not.toContain("trusted-owner");
    } finally {
      log.mockRestore();
    }
  });
});
