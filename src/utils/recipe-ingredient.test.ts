import { describe, expect, it } from "vitest";

import {
  normalizeRecipeIngredient,
  recipeIngredientOrderSchema,
  recipeIngredientRequestSchema,
} from "./recipe-ingredient";

const canonicalId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const base = {
  expectedVersion: 1,
  ingredientSource: "canonical" as const,
  ingredientId: canonicalId,
  customIngredient: "",
  quantityMode: "none" as const,
  quantityMin: "",
  quantityMax: "",
  quantityText: "",
  unitSource: "none" as const,
  unitId: "",
  customUnit: "",
  preparationNote: "",
  isOptional: false,
};

function errors(input: object) {
  const result = recipeIngredientRequestSchema.safeParse(input);
  return result.success ? {} : result.error.flatten().fieldErrors;
}

describe("recipe ingredient contract", () => {
  it("normalizes canonical input and clears contradictory custom fields", () => {
    const parsed = recipeIngredientRequestSchema.parse({
      ...base,
      customIngredient: "ignored",
      quantityMode: "single",
      quantityMin: "1.25",
      quantityMax: "ignored",
      quantityText: "ignored",
      unitSource: "canonical",
      unitId: canonicalId,
      customUnit: "ignored",
      preparationNote: " chopped ",
      isOptional: true,
    });
    expect(normalizeRecipeIngredient(parsed)).toEqual({
      ingredientId: canonicalId,
      customIngredient: null,
      quantityMin: 1.25,
      quantityMax: null,
      quantityText: null,
      unitId: canonicalId,
      customUnit: null,
      preparationNote: "chopped",
      isOptional: true,
    });
  });

  it("trims custom values and clears units for text quantity", () => {
    const parsed = recipeIngredientRequestSchema.parse({
      ...base,
      ingredientSource: "custom",
      ingredientId: "",
      customIngredient: "  chile crisp ",
      quantityMode: "text",
      quantityText: " to taste ",
      unitSource: "custom",
      customUnit: " jar ",
    });
    expect(normalizeRecipeIngredient(parsed)).toEqual(
      expect.objectContaining({
        ingredientId: null,
        customIngredient: "chile crisp",
        quantityText: "to taste",
        unitId: null,
        customUnit: null,
      }),
    );
  });

  it.each([
    [{ ...base, ingredientId: "" }, "ingredientId", "Choose an ingredient."],
    [
      { ...base, ingredientSource: "custom", ingredientId: "", customIngredient: " " },
      "customIngredient",
      "Enter an ingredient.",
    ],
    [
      {
        ...base,
        ingredientSource: "custom",
        ingredientId: "",
        customIngredient: "x".repeat(121),
      },
      "customIngredient",
      "Ingredient must be 120 characters or fewer.",
    ],
    [
      { ...base, quantityMode: "single", quantityMin: "1/2" },
      "quantityMin",
      "Enter an amount greater than 0.",
    ],
    [
      { ...base, quantityMode: "single", quantityMin: "1.00001" },
      "quantityMin",
      "Amount may have at most 4 decimal places.",
    ],
    [
      { ...base, quantityMode: "single", quantityMin: "100000000" },
      "quantityMin",
      "Amount must be 99,999,999.9999 or less.",
    ],
    [
      { ...base, quantityMode: "range", quantityMin: "2", quantityMax: "1" },
      "quantityMax",
      "Enter an ending amount greater than or equal to the starting amount.",
    ],
    [{ ...base, quantityMode: "text", quantityText: " " }, "quantityText", "Enter a quantity."],
    [{ ...base, unitSource: "canonical", unitId: "" }, "unitId", "Choose a unit."],
    [{ ...base, unitSource: "custom", customUnit: " " }, "customUnit", "Enter a unit."],
    [
      { ...base, preparationNote: "x".repeat(201) },
      "preparationNote",
      "Preparation note must be 200 characters or fewer.",
    ],
  ] as const)("returns exact validation messages", (input, field, message) => {
    expect(errors(input)[field]).toContain(message);
  });

  it("requires unique IDs for reorder", () => {
    const result = recipeIngredientOrderSchema.safeParse({
      expectedVersion: 1,
      ingredientIds: [canonicalId, canonicalId],
    });
    expect(result.success).toBe(false);
  });
});
