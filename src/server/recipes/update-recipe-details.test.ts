import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateRecipeDetails } from "./update-recipe-details";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  set: vi.fn(),
  returning: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => ({ update: mocks.update, select: mocks.select }),
}));

const argumentsForSave = {
  actorUserId: "owner",
  recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
  expectedVersion: 1,
  input: {
    title: " Chili ",
    description: " ",
    yieldMin: "4.500",
    yieldMax: "",
    yieldUnit: " ",
  },
};

describe("updateRecipeDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: () => ({ returning: mocks.returning }) });
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: mocks.limit }) }),
    });
  });

  it("normalizes details and changes only editable fields and save metadata", async () => {
    const saved = {
      id: argumentsForSave.recipeId,
      title: "Chili",
      description: null,
      yieldMin: 4.5,
      yieldMax: null,
      yieldUnit: "servings",
      version: 2,
    };
    mocks.returning.mockResolvedValue([saved]);
    await expect(updateRecipeDetails(argumentsForSave)).resolves.toEqual(saved);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith({
      title: "Chili",
      description: null,
      yieldMin: 4.5,
      yieldMax: null,
      yieldUnit: "servings",
      version: expect.anything(),
      updatedAt: expect.any(Date),
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: argumentsForSave.recipeId }, "VERSION_CONFLICT"],
    [null, "RECIPE_NOT_FOUND"],
  ])("classifies a rejected save without changing another row", async (ownedDraft, code) => {
    mocks.returning.mockResolvedValue([]);
    mocks.limit.mockResolvedValue(ownedDraft ? [ownedDraft] : []);
    await expect(updateRecipeDetails(argumentsForSave)).rejects.toMatchObject({ code });
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("validates the raw yield and version at the service boundary", async () => {
    await expect(
      updateRecipeDetails({
        ...argumentsForSave,
        input: { ...argumentsForSave.input, yieldMax: "3" },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        yieldMax: ["Enter an ending yield greater than or equal to the starting yield."],
      },
    });
    await expect(
      updateRecipeDetails({ ...argumentsForSave, expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      updateRecipeDetails({ ...argumentsForSave, recipeId: "bad-id" }),
    ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
