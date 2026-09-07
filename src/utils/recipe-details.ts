import { z } from "zod";

import { recipeDraftSchema } from "./recipe-draft";

// safeExtend retains the creation schema's cross-field yield checks.
export const recipeDetailsRequestSchema = recipeDraftSchema.safeExtend({
  expectedVersion: z.number().int().positive(),
});

export type RecipeDetailsRequest = z.input<typeof recipeDetailsRequestSchema>;

export const ownedRecipeDetailsSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(500).nullable(),
    yieldMin: z.number().positive().max(9_999_999.999).nullable(),
    yieldMax: z.number().positive().max(9_999_999.999).nullable(),
    yieldUnit: z.string().trim().min(1).max(40),
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.yieldMax === null || (value.yieldMin !== null && value.yieldMax >= value.yieldMin),
    { path: ["yieldMax"], message: "Invalid saved yield range." },
  );

export type OwnedRecipeDetails = z.infer<typeof ownedRecipeDetailsSchema>;
