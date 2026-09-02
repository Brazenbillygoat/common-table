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

const recipeIngredientInputFields = {
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
} as const;

const rawRecipeIngredientInputSchema = z.object(recipeIngredientInputFields);
export type RecipeIngredientInput = z.infer<typeof rawRecipeIngredientInputSchema>;

function validateRecipeIngredientInput(value: RecipeIngredientInput, context: z.RefinementCtx) {
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
}

export const recipeIngredientInputSchema = rawRecipeIngredientInputSchema.superRefine(
  validateRecipeIngredientInput,
);

// Validate raw form strings in both the browser and API before converting them to database values.
export const recipeIngredientRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    ...recipeIngredientInputFields,
  })
  .superRefine(validateRecipeIngredientInput);

export const recipeIngredientCreateRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    sectionId: z.string().uuid().optional(),
    ...recipeIngredientInputFields,
  })
  .superRefine(validateRecipeIngredientInput);

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

const sectionName = z.string().trim().min(1, "Enter a section name.").max(80);
const groupLabel = z.string().trim().min(1, "Enter an alternative label.").max(80);

export const recipeIngredientStructureRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("addSection"), name: sectionName }),
    z.object({ type: z.literal("renameSection"), sectionId: z.string().uuid(), name: sectionName }),
    z.object({
      type: z.literal("reorderSections"),
      sectionIds: z.array(z.string().uuid()).min(1),
    }),
    z.object({
      type: z.literal("deleteSection"),
      sectionId: z.string().uuid(),
      disposition: z.enum(["move", "delete"]),
      targetSectionId: z.string().uuid().optional(),
    }),
    z.object({
      type: z.literal("createGroup"),
      ingredientId: z.string().uuid(),
      label: groupLabel,
      option: recipeIngredientInputSchema,
    }),
    z.object({ type: z.literal("renameGroup"), groupId: z.string().uuid(), label: groupLabel }),
    z.object({
      type: z.literal("addGroupOption"),
      groupId: z.string().uuid(),
      option: recipeIngredientInputSchema,
    }),
    z.object({
      type: z.literal("reorderGroupOptions"),
      groupId: z.string().uuid(),
      optionIds: z.array(z.string().uuid()).min(2),
    }),
    z.object({ type: z.literal("ungroup"), groupId: z.string().uuid() }),
    z.object({ type: z.literal("deleteGroup"), groupId: z.string().uuid() }),
    z.object({
      type: z.literal("moveItem"),
      itemType: z.enum(["ingredient", "group"]),
      itemId: z.string().uuid(),
      targetSectionId: z.string().uuid(),
      targetIndex: z.number().int().nonnegative(),
    }),
  ]),
});

export type RecipeIngredientRequest = z.infer<typeof recipeIngredientRequestSchema>;
export type RecipeIngredientCreateRequest = z.infer<typeof recipeIngredientCreateRequestSchema>;
export type RecipeIngredientDeleteRequest = z.infer<typeof recipeIngredientDeleteSchema>;
export type RecipeIngredientOrderRequest = z.infer<typeof recipeIngredientOrderSchema>;
export type RecipeIngredientStructureRequest = z.infer<
  typeof recipeIngredientStructureRequestSchema
>;
export type RecipeIngredientStructureAction = RecipeIngredientStructureRequest["action"];

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
  sectionId?: string;
  choiceGroupId?: string | null;
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

export interface RecipeIngredientSection {
  id: string;
  name: string | null;
  position: number;
}

export interface RecipeIngredientChoiceGroup {
  id: string;
  sectionId: string;
  label: string;
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
  sections?: RecipeIngredientSection[];
  choiceGroups?: RecipeIngredientChoiceGroup[];
  ingredientOptions: RecipeIngredientOption[];
  unitOptions: RecipeUnitOption[];
}

export function normalizeRecipeIngredient(
  input: RecipeIngredientInput | RecipeIngredientRequest | RecipeIngredientCreateRequest,
): NormalizedRecipeIngredient {
  const textQuantity = input.quantityMode === "text";

  // Keep only values used by the selected modes so hidden fields cannot conflict.
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

function validateQuantity(value: RecipeIngredientInput, context: z.RefinementCtx) {
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

export function formatRecipeIngredientLine(line: RecipeIngredientLine) {
  const quantity = line.quantityText
    ? line.quantityText
    : line.quantityMin !== null
      ? line.quantityMax !== null
        ? `${line.quantityMin}–${line.quantityMax}`
        : `${line.quantityMin}`
      : "";
  return [
    quantity,
    line.unitName,
    line.ingredientName,
    line.preparationNote ? `, ${line.preparationNote}` : "",
    line.isOptional ? " (optional)" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" ,", ",");
}
