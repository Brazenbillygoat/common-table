import { z } from "zod";

export const recipeStepMessages = {
  required: "Enter an instruction.",
  tooLong: "Instruction must be 2,000 characters or fewer.",
  duplicateIds: "Step IDs must be unique.",
  conditionRequired: "Choose the ingredient choice that controls this instruction.",
} as const;

export const recipeStepRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    instruction: z
      .string()
      .refine((value) => value.trim().length > 0, recipeStepMessages.required)
      .refine((value) => value.trim().length <= 2_000, recipeStepMessages.tooLong),
    conditionKind: z.enum(["always", "choice_option", "optional_ingredient"]).optional(),
    conditionIngredientId: z.union([z.literal(""), z.string().uuid()]).optional(),
  })
  .superRefine((value, context) => {
    const kind = value.conditionKind ?? "always";
    const ingredientId = value.conditionIngredientId ?? "";
    if (kind !== "always" && !ingredientId) {
      context.addIssue({
        code: "custom",
        path: ["conditionIngredientId"],
        message: recipeStepMessages.conditionRequired,
      });
    }
    if (kind === "always" && ingredientId) {
      context.addIssue({
        code: "custom",
        path: ["conditionIngredientId"],
        message: "Always-applicable instructions cannot reference an ingredient choice.",
      });
    }
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
  conditionKind?: "choice_option" | "optional_ingredient" | null;
  conditionIngredientId?: string | null;
}

export interface RecipeStep {
  id: string;
  position: number;
  instruction: string;
  conditionKind?: "choice_option" | "optional_ingredient" | null;
  conditionIngredientId?: string | null;
  conditionLabel?: string | null;
}

export interface RecipeStepConditionOption {
  id: string;
  kind: "choice_option" | "optional_ingredient";
  label: string;
}

export interface RecipeStepEditorData {
  recipe: { id: string; title: string; version: number };
  steps: RecipeStep[];
  conditionOptions?: RecipeStepConditionOption[];
}

export function normalizeRecipeStep(input: RecipeStepRequest): NormalizedRecipeStep {
  const normalized: NormalizedRecipeStep = { instruction: input.instruction.trim() };
  if (input.conditionKind !== undefined || input.conditionIngredientId !== undefined) {
    normalized.conditionKind =
      input.conditionKind && input.conditionKind !== "always" ? input.conditionKind : null;
    normalized.conditionIngredientId =
      normalized.conditionKind && input.conditionIngredientId ? input.conditionIngredientId : null;
  }
  return normalized;
}
