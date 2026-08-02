import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnedRecipeStepEditor } from "./get-owned-recipe-step-editor";

const mocks = vi.hoisted(() => ({
  recipeLimit: vi.fn(),
  stepOrder: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  getDatabase: () => ({ select: mocks.select }),
}));
vi.mock("server-only", () => ({}));

describe("getOwnedRecipeStepEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.select
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: mocks.recipeLimit }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ orderBy: mocks.stepOrder }) }),
      });
  });

  it("returns only safe recipe and ordered step fields", async () => {
    const safeRecipe = {
      id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
      title: "Chili",
      version: 3,
    };
    const safeSteps = [
      {
        id: "e785b35e-4ff4-421b-9609-58b889461279",
        position: 0,
        instruction: "Stir.",
      },
    ];
    mocks.recipeLimit.mockResolvedValue([safeRecipe]);
    mocks.stepOrder.mockResolvedValue(safeSteps);
    await expect(getOwnedRecipeStepEditor(safeRecipe.id, "trusted-user")).resolves.toEqual({
      recipe: safeRecipe,
      steps: safeSteps,
    });
    expect(mocks.recipeLimit).toHaveBeenCalledOnce();
    expect(mocks.stepOrder).toHaveBeenCalledOnce();
  });

  it("returns null without loading steps when the owned draft is unavailable", async () => {
    mocks.recipeLimit.mockResolvedValue([]);
    await expect(
      getOwnedRecipeStepEditor("34053bb6-c957-4d2d-a621-b2e34b774a1d", "other-user"),
    ).resolves.toBeNull();
    expect(mocks.stepOrder).not.toHaveBeenCalled();
  });

  it("returns an empty ordered step list unchanged", async () => {
    mocks.recipeLimit.mockResolvedValue([{ id: "id", title: "Chili", version: 1 }]);
    mocks.stepOrder.mockResolvedValue([]);
    await expect(getOwnedRecipeStepEditor("id", "owner")).resolves.toEqual({
      recipe: { id: "id", title: "Chili", version: 1 },
      steps: [],
    });
  });
});
