import { z } from "zod";

export const ingredientMessages = {
  ingredientRequired: "Choose an ingredient.",
  customIngredientRequired: "Enter an ingredient.",
  customIngredientTooLong: "Ingredient must be 120 characters or fewer.",
  ingredientUnavailable: "Choose an available ingredient.",
  amountRequired: "Enter an amount greater than 0.",
  endingAmountRequired: "Enter an ending amount greater than 0.",
  rangeReversed: "Enter an ending amount greater than or equal to the starting amount.",
  amountPrecision: "Amount may have at most 4 decimal places.",
  endingAmountPrecision: "Ending amount may have at most 4 decimal places.",
  amountMaximum: "Amount must be 99,999,999.9999 or less.",
  endingAmountMaximum: "Ending amount must be 99,999,999.9999 or less.",
  quantityTextRequired: "Enter a quantity.",
  quantityTextTooLong: "Quantity must be 40 characters or fewer.",
  unitRequired: "Choose a unit.",
  customUnitRequired: "Enter a unit.",
  customUnitTooLong: "Unit must be 40 characters or fewer.",
  unitUnavailable: "Choose an available unit.",
  preparationNoteTooLong: "Preparation note must be 200 characters or fewer.",
} as const;

const decimalPattern = /^\d+(?:\.\d+)?$/;
const uuidOrEmpty = z.union([z.literal(""), z.string().uuid()]);

export const recipeIngredientRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ingredientSource: z.enum(["canonical", "custom"]),
    ingredientId: uuidOrEmpty,
    customIngredient: z.string(),
    quantityMode: z.enum(["none", "single", "range", "text"]),
    quantityMin: z.string(),
    quantityMax: z.string(),
    quantityText: z.string(),
    unitSource: z.enum(["none", "canonical", "custom"]),
    unitId: uuidOrEmpty,
    customUnit: z.string(),
    preparationNote: z.string(),
    isOptional: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.ingredientSource === "canonical" && !value.ingredientId) {
      context.addIssue({
        code: "custom",
        path: ["ingredientId"],
        message: ingredientMessages.ingredientRequired,
      });
    }
    const customIngredient = value.customIngredient.trim();
    if (value.ingredientSource === "custom" && !customIngredient) {
      context.addIssue({
        code: "custom",
        path: ["customIngredient"],
        message: ingredientMessages.customIngredientRequired,
      });
    } else if (value.ingredientSource === "custom" && customIngredient.length > 120) {
      context.addIssue({
        code: "custom",
        path: ["customIngredient"],
        message: ingredientMessages.customIngredientTooLong,
      });
    }

    validateQuantity(value, context);

    if (value.quantityMode !== "text" && value.unitSource === "canonical" && !value.unitId) {
      context.addIssue({
        code: "custom",
        path: ["unitId"],
        message: ingredientMessages.unitRequired,
      });
    }
    const customUnit = value.customUnit.trim();
    if (value.quantityMode !== "text" && value.unitSource === "custom" && !customUnit) {
      context.addIssue({
        code: "custom",
        path: ["customUnit"],
        message: ingredientMessages.customUnitRequired,
      });
    } else if (
      value.quantityMode !== "text" &&
      value.unitSource === "custom" &&
      customUnit.length > 40
    ) {
      context.addIssue({
        code: "custom",
        path: ["customUnit"],
        message: ingredientMessages.customUnitTooLong,
      });
    }

    if (value.preparationNote.trim().length > 200) {
      context.addIssue({
        code: "custom",
        path: ["preparationNote"],
        message: ingredientMessages.preparationNoteTooLong,
      });
    }
  });

export const recipeIngredientDeleteSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const recipeIngredientOrderSchema = z.object({
  expectedVersion: z.number().int().positive(),
  ingredientIds: z.array(z.string().uuid()).refine((ids) => new Set(ids).size === ids.length, {
    message: "Ingredient IDs must be unique.",
    path: ["ingredientIds"],
  }),
});

export type RecipeIngredientRequest = z.infer<typeof recipeIngredientRequestSchema>;
export type RecipeIngredientDeleteRequest = z.infer<typeof recipeIngredientDeleteSchema>;
export type RecipeIngredientOrderRequest = z.infer<typeof recipeIngredientOrderSchema>;

export interface NormalizedRecipeIngredient {
  ingredientId: string | null;
  customIngredient: string | null;
  quantityMin: number | null;
  quantityMax: number | null;
  quantityText: string | null;
  unitId: string | null;
  customUnit: string | null;
  preparationNote: string | null;
  isOptional: boolean;
}

export interface RecipeIngredientLine {
  id: string;
  position: number;
  ingredientId: string | null;
  ingredientName: string;
  customIngredient: string | null;
  quantityMin: number | null;
  quantityMax: number | null;
  quantityText: string | null;
  unitId: string | null;
  unitName: string | null;
  customUnit: string | null;
  preparationNote: string | null;
  isOptional: boolean;
}

export interface RecipeIngredientOption {
  id: string;
  name: string;
}

export interface RecipeUnitOption {
  id: string;
  name: string;
  kind: "volume" | "weight" | "count" | "other";
}

export interface RecipeIngredientEditorData {
  recipe: { id: string; title: string; version: number };
  lines: RecipeIngredientLine[];
  ingredientOptions: RecipeIngredientOption[];
  unitOptions: RecipeUnitOption[];
}

export function normalizeRecipeIngredient(
  input: RecipeIngredientRequest,
): NormalizedRecipeIngredient {
  const textQuantity = input.quantityMode === "text";
  return {
    ingredientId: input.ingredientSource === "canonical" ? input.ingredientId : null,
    customIngredient: input.ingredientSource === "custom" ? input.customIngredient.trim() : null,
    quantityMin:
      input.quantityMode === "single" || input.quantityMode === "range"
        ? Number(input.quantityMin)
        : null,
    quantityMax: input.quantityMode === "range" ? Number(input.quantityMax) : null,
    quantityText: textQuantity ? input.quantityText.trim() : null,
    unitId: !textQuantity && input.unitSource === "canonical" ? input.unitId : null,
    customUnit: !textQuantity && input.unitSource === "custom" ? input.customUnit.trim() : null,
    preparationNote: input.preparationNote.trim() || null,
    isOptional: input.isOptional,
  };
}

function validateQuantity(value: RecipeIngredientRequest, context: z.RefinementCtx) {
  if (value.quantityMode === "single" || value.quantityMode === "range") {
    validateDecimal(value.quantityMin, "quantityMin", context, false);
  }
  if (value.quantityMode === "range") {
    validateDecimal(value.quantityMax, "quantityMax", context, true);
    if (
      isValidDecimal(value.quantityMin) &&
      isValidDecimal(value.quantityMax) &&
      Number(value.quantityMax) < Number(value.quantityMin)
    ) {
      context.addIssue({
        code: "custom",
        path: ["quantityMax"],
        message: ingredientMessages.rangeReversed,
      });
    }
  }
  if (value.quantityMode === "text") {
    const quantityText = value.quantityText.trim();
    if (!quantityText) {
      context.addIssue({
        code: "custom",
        path: ["quantityText"],
        message: ingredientMessages.quantityTextRequired,
      });
    } else if (quantityText.length > 40) {
      context.addIssue({
        code: "custom",
        path: ["quantityText"],
        message: ingredientMessages.quantityTextTooLong,
      });
    }
  }
}

function validateDecimal(
  input: string,
  path: "quantityMin" | "quantityMax",
  context: z.RefinementCtx,
  ending: boolean,
) {
  if (!decimalPattern.test(input) || Number(input) <= 0) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: ending ? ingredientMessages.endingAmountRequired : ingredientMessages.amountRequired,
    });
    return;
  }
  if ((input.split(".")[1]?.length ?? 0) > 4) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: ending
        ? ingredientMessages.endingAmountPrecision
        : ingredientMessages.amountPrecision,
    });
    return;
  }
  if (Number(input) > 99_999_999.9999) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: ending ? ingredientMessages.endingAmountMaximum : ingredientMessages.amountMaximum,
    });
  }
}

function isValidDecimal(input: string) {
  return decimalPattern.test(input) && Number(input) > 0 && Number(input) <= 99_999_999.9999;
}
