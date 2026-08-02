import { z } from "zod";

export const recipeStepMessages = {
  required: "Enter an instruction.",
  tooLong: "Instruction must be 2,000 characters or fewer.",
  duplicateIds: "Step IDs must be unique.",
} as const;

export const recipeStepRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  instruction: z
    .string()
    .refine((value) => value.trim().length > 0, recipeStepMessages.required)
    .refine((value) => value.trim().length <= 2_000, recipeStepMessages.tooLong),
});

export const recipeStepDeleteSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const recipeStepOrderSchema = z.object({
  expectedVersion: z.number().int().positive(),
  stepIds: z.array(z.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
    message: recipeStepMessages.duplicateIds,
    path: ["stepIds"],
  }),
});

export type RecipeStepRequest = z.infer<typeof recipeStepRequestSchema>;

export interface NormalizedRecipeStep {
  instruction: string;
}

export interface RecipeStep {
  id: string;
  position: number;
  instruction: string;
}

export interface RecipeStepEditorData {
  recipe: { id: string; title: string; version: number };
  steps: RecipeStep[];
}

export function normalizeRecipeStep(input: RecipeStepRequest): NormalizedRecipeStep {
  return { instruction: input.instruction.trim() };
}
