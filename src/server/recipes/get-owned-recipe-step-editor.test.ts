import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnedRecipeStepEditor } from "./get-owned-recipe-step-editor";

const mocks = vi.hoisted(() => ({
  recipeLimit: vi.fn(),
  stepOrder: vi.fn(),
  conditionOrder: vi.fn(),
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
      })
      .mockReturnValueOnce({
        from: () => ({
          leftJoin: () => ({
            leftJoin: () => ({ where: () => ({ orderBy: mocks.conditionOrder }) }),
          }),
        }),
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
        conditionKind: null,
        conditionIngredientId: null,
      },
    ];
    mocks.recipeLimit.mockResolvedValue([safeRecipe]);
    mocks.stepOrder.mockResolvedValue(safeSteps);
    mocks.conditionOrder.mockResolvedValue([]);
    await expect(getOwnedRecipeStepEditor(safeRecipe.id, "trusted-user")).resolves.toEqual({
      recipe: safeRecipe,
      steps: [{ ...safeSteps[0], conditionLabel: null }],
      conditionOptions: [],
    });
    expect(mocks.recipeLimit).toHaveBeenCalledOnce();
    expect(mocks.stepOrder).toHaveBeenCalledOnce();
    expect(mocks.conditionOrder).toHaveBeenCalledOnce();
  });

  it("returns null without loading steps when the owned draft is unavailable", async () => {
    mocks.recipeLimit.mockResolvedValue([]);
    await expect(
      getOwnedRecipeStepEditor("34053bb6-c957-4d2d-a621-b2e34b774a1d", "other-user"),
    ).resolves.toBeNull();
    expect(mocks.stepOrder).not.toHaveBeenCalled();
  });

  it("returns only recipe-owned alternative and optional condition choices with labels", async () => {
    const choiceId = "e785b35e-4ff4-421b-9609-58b889461279";
    const optionalId = "c62ec57a-7ef4-470c-ae03-10a74b8aabf2";
    mocks.recipeLimit.mockResolvedValue([{ id: "id", title: "Chili", version: 2 }]);
    mocks.stepOrder.mockResolvedValue([
      {
        id: "step",
        position: 0,
        instruction: "Cook tofu.",
        conditionKind: "choice_option",
        conditionIngredientId: choiceId,
      },
    ]);
    mocks.conditionOrder.mockResolvedValue([
      {
        id: choiceId,
        choiceGroupId: "group",
        groupLabel: "Protein",
        isOptional: false,
        canonicalName: "Tofu",
        customName: null,
      },
      {
        id: optionalId,
        choiceGroupId: null,
        groupLabel: null,
        isOptional: true,
        canonicalName: null,
        customName: "Green onions",
      },
      {
        id: "standalone",
        choiceGroupId: null,
        groupLabel: null,
        isOptional: false,
        canonicalName: "Salt",
        customName: null,
      },
    ]);

    await expect(getOwnedRecipeStepEditor("id", "owner")).resolves.toEqual({
      recipe: { id: "id", title: "Chili", version: 2 },
      steps: [
        {
          id: "step",
          position: 0,
          instruction: "Cook tofu.",
          conditionKind: "choice_option",
          conditionIngredientId: choiceId,
          conditionLabel: "Protein: Tofu",
        },
      ],
      conditionOptions: [
        { id: choiceId, kind: "choice_option", label: "Protein: Tofu" },
        { id: optionalId, kind: "optional_ingredient", label: "Optional: Green onions" },
      ],
    });
  });

  it("returns an empty ordered step list unchanged", async () => {
    mocks.recipeLimit.mockResolvedValue([{ id: "id", title: "Chili", version: 1 }]);
    mocks.stepOrder.mockResolvedValue([]);
    mocks.conditionOrder.mockResolvedValue([]);
    await expect(getOwnedRecipeStepEditor("id", "owner")).resolves.toEqual({
      recipe: { id: "id", title: "Chili", version: 1 },
      steps: [],
      conditionOptions: [],
    });
  });
});
