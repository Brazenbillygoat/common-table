import type { PublishedRecipeSnapshot } from "./recipe-publication";

export const searchFixtureId = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

export function searchSnapshot(): PublishedRecipeSnapshot {
  const id = searchFixtureId;
  const ingredient = (
    value: number,
    name: string,
    choiceGroupId: string | null,
    isOptional = false,
  ) => ({
    id: id(value),
    sectionId: id(2),
    choiceGroupId,
    position: value - 10,
    ingredientId: null,
    ingredientName: name,
    customIngredient: name,
    quantityMin: null,
    quantityMax: null,
    quantityText: null,
    unitId: null,
    unitName: null,
    customUnit: null,
    preparationNote: null,
    isOptional,
  });
  return {
    recipe: {
      id: id(1),
      slug: "family-stew",
      title: "Family stew",
      description: "A warming supper",
      yieldMin: null,
      yieldMax: null,
      yieldUnit: "servings",
    },
    authorDisplayName: "Test cook",
    sections: [{ id: id(2), name: "Pot", position: 0 }],
    choiceGroups: [
      { id: id(3), sectionId: id(2), label: "Protein" },
      { id: id(4), sectionId: id(2), label: "Cooking fat" },
    ],
    ingredients: [
      ingredient(10, "Chicken", id(3)),
      ingredient(11, "Tofu", id(3)),
      ingredient(12, "Salted butter", id(4)),
      ingredient(13, "Olive oil", id(4)),
      ingredient(14, "Peanut butter", null, true),
      ingredient(15, "Beans", null),
    ],
    steps: [
      {
        id: id(20),
        position: 0,
        instruction: "Simmer.",
        conditionKind: null,
        conditionIngredientId: null,
        conditionLabel: null,
      },
    ],
  };
}
