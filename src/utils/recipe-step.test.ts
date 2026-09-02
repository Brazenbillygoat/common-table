import { describe, expect, it } from "vitest";

import {
  normalizeRecipeStep,
  recipeStepDeleteSchema,
  recipeStepOrderSchema,
  recipeStepRequestSchema,
} from "./recipe-step";

const firstId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const secondId = "e785b35e-4ff4-421b-9609-58b889461279";

describe("recipe step contract", () => {
  it("trims outer whitespace while preserving internal spaces and line breaks", () => {
    const input = recipeStepRequestSchema.parse({
      expectedVersion: 1,
      instruction: "  Stir  gently.\n\nServe warm.  ",
    });
    expect(normalizeRecipeStep(input)).toEqual({
      instruction: "Stir  gently.\n\nServe warm.",
    });
  });

  it("rejects blank instructions with the exact message", () => {
    const result = recipeStepRequestSchema.safeParse({ expectedVersion: 1, instruction: " \n " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.instruction).toEqual(["Enter an instruction."]);
    }
  });

  it("accepts 2,000 trimmed characters and rejects 2,001", () => {
    expect(
      recipeStepRequestSchema.safeParse({ expectedVersion: 1, instruction: "x".repeat(2_000) })
        .success,
    ).toBe(true);
    const result = recipeStepRequestSchema.safeParse({
      expectedVersion: 1,
      instruction: "x".repeat(2_001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.instruction).toEqual([
        "Instruction must be 2,000 characters or fewer.",
      ]);
    }
  });

  it("requires positive integer versions for writes and deletes", () => {
    expect(
      recipeStepRequestSchema.safeParse({ expectedVersion: 0, instruction: "Stir." }).success,
    ).toBe(false);
    expect(recipeStepDeleteSchema.safeParse({ expectedVersion: 1.5 }).success).toBe(false);
    expect(recipeStepDeleteSchema.safeParse({ expectedVersion: 2 }).success).toBe(true);
  });

  it("normalizes valid choice and optional conditions and clears an explicit Always choice", () => {
    expect(
      normalizeRecipeStep(
        recipeStepRequestSchema.parse({
          expectedVersion: 1,
          instruction: "Cook the selected protein.",
          conditionKind: "choice_option",
          conditionIngredientId: firstId,
        }),
      ),
    ).toEqual({
      instruction: "Cook the selected protein.",
      conditionKind: "choice_option",
      conditionIngredientId: firstId,
    });
    expect(
      normalizeRecipeStep(
        recipeStepRequestSchema.parse({
          expectedVersion: 2,
          instruction: "Serve.",
          conditionKind: "always",
          conditionIngredientId: "",
        }),
      ),
    ).toEqual({ instruction: "Serve.", conditionKind: null, conditionIngredientId: null });
  });

  it("rejects incomplete or contradictory conditions", () => {
    const missing = recipeStepRequestSchema.safeParse({
      expectedVersion: 1,
      instruction: "Cook it.",
      conditionKind: "choice_option",
      conditionIngredientId: "",
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.flatten().fieldErrors.conditionIngredientId).toEqual([
        "Choose the ingredient choice that controls this instruction.",
      ]);
    }
    expect(
      recipeStepRequestSchema.safeParse({
        expectedVersion: 1,
        instruction: "Cook it.",
        conditionKind: "always",
        conditionIngredientId: firstId,
      }).success,
    ).toBe(false);
  });

  it("accepts valid reorder IDs and rejects duplicates with the exact message", () => {
    expect(
      recipeStepOrderSchema.safeParse({ expectedVersion: 1, stepIds: [firstId, secondId] }).success,
    ).toBe(true);
    const result = recipeStepOrderSchema.safeParse({
      expectedVersion: 1,
      stepIds: [firstId, firstId],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.stepIds).toEqual(["Step IDs must be unique."]);
    }
  });
});
