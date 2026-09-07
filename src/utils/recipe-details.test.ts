import { describe, expect, it } from "vitest";

import { ownedRecipeDetailsSchema, recipeDetailsRequestSchema } from "./recipe-details";

const saved = {
  id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
  title: "Chili",
  description: null,
  yieldMin: 4,
  yieldMax: 6,
  yieldUnit: "servings",
  version: 2,
};

describe("recipe Details validation", () => {
  it("retains creation's yield range rules while requiring a positive save counter", () => {
    const input = {
      title: "Chili",
      description: "",
      yieldMin: "4",
      yieldMax: "6",
      yieldUnit: "",
      expectedVersion: 1,
    };
    expect(recipeDetailsRequestSchema.safeParse(input).success).toBe(true);
    expect(recipeDetailsRequestSchema.safeParse({ ...input, yieldMax: "3" }).success).toBe(false);
    expect(recipeDetailsRequestSchema.safeParse({ ...input, expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(recipeDetailsRequestSchema.safeParse({ ...input, yieldMin: "0.0001" }).success).toBe(
      false,
    );
  });

  it("requires a complete saved recipe response before replacing entered values", () => {
    expect(ownedRecipeDetailsSchema.parse(saved)).toEqual(saved);
    expect(ownedRecipeDetailsSchema.safeParse({ id: saved.id, version: 2 }).success).toBe(false);
    expect(ownedRecipeDetailsSchema.safeParse({ ...saved, version: 0 }).success).toBe(false);
    expect(ownedRecipeDetailsSchema.safeParse({ ...saved, yieldMin: null }).success).toBe(false);
    expect(ownedRecipeDetailsSchema.safeParse({ ...saved, yieldMax: 2 }).success).toBe(false);
    expect(ownedRecipeDetailsSchema.safeParse({ ...saved, yieldMin: "4" }).success).toBe(false);
  });
});
