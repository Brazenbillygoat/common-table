import { z } from "zod";

const maximumYield = 9_999_999.999;
const decimalPattern = /^\d+(?:\.\d{1,3})?$/;

function decimalField(label: "starting" | "ending") {
  const positiveMessage =
    label === "starting"
      ? "Enter a yield greater than 0."
      : "Enter an ending yield greater than 0.";
  const decimalMessage =
    label === "starting"
      ? "Yield may have at most 3 decimal places."
      : "Ending yield may have at most 3 decimal places.";
  const maximumMessage =
    label === "starting"
      ? "Yield must be 9,999,999.999 or less."
      : "Ending yield must be 9,999,999.999 or less.";

  return z.string().superRefine((value, context) => {
    if (value === "") return;

    if (!decimalPattern.test(value)) {
      context.addIssue({
        code: "custom",
        message: /^\d+\.\d{4,}$/.test(value) ? decimalMessage : positiveMessage,
      });
      return;
    }

    const amount = Number(value);
    if (amount <= 0) {
      context.addIssue({ code: "custom", message: positiveMessage });
    } else if (amount > maximumYield) {
      context.addIssue({ code: "custom", message: maximumMessage });
    }
  });
}

export const recipeDraftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a recipe title.")
      .max(120, "Recipe title must be 120 characters or fewer."),
    description: z.string().trim().max(500, "Description must be 500 characters or fewer."),
    yieldMin: decimalField("starting"),
    yieldMax: decimalField("ending"),
    yieldUnit: z.string().trim().max(40, "Yield unit must be 40 characters or fewer."),
  })
  .superRefine((values, context) => {
    if (values.yieldMax && !values.yieldMin) {
      context.addIssue({
        code: "custom",
        path: ["yieldMin"],
        message: "Enter a yield greater than 0.",
      });
    }

    if (
      decimalPattern.test(values.yieldMin) &&
      decimalPattern.test(values.yieldMax) &&
      Number(values.yieldMax) < Number(values.yieldMin)
    ) {
      context.addIssue({
        code: "custom",
        path: ["yieldMax"],
        message: "Enter an ending yield greater than or equal to the starting yield.",
      });
    }
  });

export type RecipeDraftRequest = z.input<typeof recipeDraftSchema>;

export interface NormalizedRecipeDraft {
  title: string;
  description: string | null;
  yieldMin: number | null;
  yieldMax: number | null;
  yieldUnit: string;
}

export function normalizeRecipeDraft(
  values: z.output<typeof recipeDraftSchema>,
): NormalizedRecipeDraft {
  const description = values.description.trim();
  const unit = values.yieldUnit.trim();

  return {
    title: values.title.trim(),
    description: description || null,
    yieldMin: values.yieldMin ? Number(values.yieldMin) : null,
    yieldMax: values.yieldMax ? Number(values.yieldMax) : null,
    yieldUnit: unit || "servings",
  };
}
