import { describe, expect, it } from "vitest";

import type { RecipeAlternativeContent } from "./recipe-alternatives";
import { recipeSelectionFromQuery, resolveRecipeAlternatives } from "./recipe-alternatives";

const sectionId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const proteinGroupId = "e785b35e-4ff4-421b-9609-58b889461279";
const oilGroupId = "de5797ee-837d-48ea-8367-69ea4033be6f";
const tofuId = "a934e125-6bd3-4593-91fd-22c306815b01";
const porkId = "a66e9487-0208-4389-a2ab-80484cf9d6f2";
const cookingOilId = "cd5bda33-a782-41fd-ac25-1774d8b83771";
const brushingOilId = "f4275994-4004-448f-b1fd-0d64f3f8ee65";
const optionalId = "ef515bea-3ea8-4c62-b803-4649b6ec9c7e";

const content: RecipeAlternativeContent = {
  sections: [{ id: sectionId, name: "Filling", position: 0 }],
  choiceGroups: [
    { id: proteinGroupId, sectionId, label: "Protein" },
    { id: oilGroupId, sectionId, label: "Oil" },
  ],
  ingredients: [
    line(tofuId, 0, "Tofu", proteinGroupId),
    line(porkId, 1, "Pork", proteinGroupId),
    line(cookingOilId, 2, "Cooking oil", oilGroupId),
    line(brushingOilId, 3, "Brushing oil", oilGroupId),
    { ...line(optionalId, 4, "Green onions", null), isOptional: true },
  ],
  steps: [
    { id: "1", position: 0, instruction: "Prepare wrappers." },
    {
      id: "2",
      position: 1,
      instruction: "Cook tofu.",
      conditionKind: "choice_option",
      conditionIngredientId: tofuId,
      conditionLabel: "Protein: Tofu",
    },
    {
      id: "3",
      position: 2,
      instruction: "Add green onions.",
      conditionKind: "optional_ingredient",
      conditionIngredientId: optionalId,
      conditionLabel: "Optional: Green onions",
    },
  ],
};

describe("recipe alternatives resolver", () => {
  it("keeps undecided OR branches visible and excludes inactive branches from numbering", () => {
    const resolved = resolveRecipeAlternatives(content, {
      choiceOptionIds: [],
      optionalIngredientIds: [],
    });
    expect(resolved.ingredients.map((line) => line.state)).toEqual([
      "unresolved",
      "unresolved",
      "unresolved",
      "unresolved",
      "inactive",
    ]);
    expect(resolved.steps.map((step) => [step.state, step.activeNumber])).toEqual([
      ["active", 1],
      ["unresolved", null],
      ["inactive", null],
    ]);
  });

  it("resolves independent groups and produces one contiguous active sequence", () => {
    const resolved = resolveRecipeAlternatives(content, {
      choiceOptionIds: [tofuId, brushingOilId],
      optionalIngredientIds: [optionalId],
    });
    expect(resolved.selectedChoiceByGroup).toEqual({
      [proteinGroupId]: tofuId,
      [oilGroupId]: brushingOilId,
    });
    expect(resolved.steps.map((step) => [step.state, step.activeNumber])).toEqual([
      ["active", 1],
      ["active", 2],
      ["active", 3],
    ]);
  });

  it("ignores stale IDs and conflicting selections without substituting an option", () => {
    const stale = "11111111-1111-4111-8111-111111111111";
    const resolved = resolveRecipeAlternatives(content, {
      choiceOptionIds: [tofuId, porkId, stale],
      optionalIngredientIds: [stale],
    });
    expect(resolved.selectedChoiceByGroup).toEqual({});
    expect(resolved.invalidSelectionIds).toEqual(expect.arrayContaining([tofuId, porkId, stale]));
    expect(resolved.ingredients.slice(0, 2).map((line) => line.state)).toEqual([
      "unresolved",
      "unresolved",
    ]);
  });

  it("reads repeated query parameters without inventing persistence", () => {
    expect(
      recipeSelectionFromQuery({ choice: [tofuId, brushingOilId], optional: optionalId }),
    ).toEqual({
      choiceOptionIds: [tofuId, brushingOilId],
      optionalIngredientIds: [optionalId],
    });
  });

  it("treats semantically invalid authored condition references as unresolved", () => {
    const resolved = resolveRecipeAlternatives(
      {
        ...content,
        steps: [
          {
            id: "mismatch",
            position: 0,
            instruction: "Invalid legacy condition.",
            conditionKind: "choice_option",
            conditionIngredientId: optionalId,
          },
        ],
      },
      { choiceOptionIds: [tofuId], optionalIngredientIds: [optionalId] },
    );
    expect(resolved.steps[0]).toMatchObject({ state: "unresolved", activeNumber: null });
  });
});

function line(id: string, position: number, ingredientName: string, choiceGroupId: string | null) {
  return {
    id,
    sectionId,
    choiceGroupId,
    position,
    ingredientId: null,
    ingredientName,
    customIngredient: ingredientName,
    quantityMin: null,
    quantityMax: null,
    quantityText: null,
    unitId: null,
    unitName: null,
    customUnit: null,
    preparationNote: null,
    isOptional: false,
  };
}
