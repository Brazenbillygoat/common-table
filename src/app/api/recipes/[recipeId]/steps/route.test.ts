import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
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
  createRecipeStep: mocks.create,
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";

function request(value: unknown = { expectedVersion: 1, instruction: " Stir. " }) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(value) });
}

describe("POST recipe step", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid IDs, malformed JSON, and invalid fields before auth", async () => {
    expect(
      (
        await POST(request(), {
          params: Promise.resolve({ recipeId: "bad" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(new Request("http://localhost", { method: "POST", body: "{" }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(request({ expectedVersion: 1, instruction: " " }), {
          params: Promise.resolve({ recipeId }),
        })
      ).status,
    ).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("returns 401 without calling the service", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ recipeId }) });
    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("uses only the authenticated actor and returns safe 201 data", async () => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    const result = {
      step: { id: crypto.randomUUID(), position: 0, instruction: "Stir." },
      version: 2,
    };
    mocks.create.mockResolvedValue(result);
    const response = await POST(
      request({
        expectedVersion: 1,
        instruction: " Stir. ",
        ownerId: "attacker",
        status: "published",
      }),
      { params: Promise.resolve({ recipeId }) },
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: result });
    expect(mocks.create).toHaveBeenCalledWith({
      actorUserId: "trusted-user",
      recipeId,
      expectedVersion: 1,
      input: { instruction: "Stir." },
    });
  });

  it.each([
    ["RECIPE_NOT_FOUND", 404],
    ["VERSION_CONFLICT", 409],
  ] as const)("maps %s safely", async (code, status) => {
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.create.mockRejectedValue(new mocks.RecipeStepError(code));
    const response = await POST(request(), { params: Promise.resolve({ recipeId }) });
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("trusted-user");
  });

  it("hides unexpected error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.session.mockResolvedValue({ user: { id: "trusted-user" } });
    mocks.create.mockRejectedValue(new Error("private SQL"));
    const response = await POST(request(), { params: Promise.resolve({ recipeId }) });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private SQL");
  });
});
