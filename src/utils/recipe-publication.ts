import { z } from "zod";

export const publicationRequestSchema = z.object({
  action: z.enum(["publish", "unpublish"]),
  expectedVersion: z.number().int().positive(),
});

export function publicationReadiness(content: {
  recipe: { title: string };
  ingredients: unknown[];
  steps: unknown[];
}) {
  const missing: Array<{
    stage: "details" | "ingredients" | "instructions";
    message: string;
  }> = [];
  if (!content.recipe.title.trim() || content.recipe.title.trim().length > 120)
    missing.push({ stage: "details", message: "Add a valid recipe title." });
  if (!content.ingredients.length)
    missing.push({ stage: "ingredients", message: "Add at least one ingredient." });
  if (!content.steps.length)
    missing.push({ stage: "instructions", message: "Add at least one instruction." });
  return missing;
}

const id = z.string().uuid();
const position = z.number().int().nonnegative();
const text = (max: number) => z.string().trim().min(1).max(max);
const amount = z.number().positive().max(99_999_999.9999).nullable();

// This is an allowlist of public values, not a serialization of a database row.
// Strict objects reject accidentally added private fields during capture or reads.
export const publishedRecipeSnapshotSchema = z
  .strictObject({
    recipe: z.strictObject({
      id,
      slug: text(200),
      title: text(120),
      description: z.string().max(500).nullable(),
      yieldMin: z.number().positive().max(9_999_999.999).nullable(),
      yieldMax: z.number().positive().max(9_999_999.999).nullable(),
      yieldUnit: z.string().max(40),
    }),
    authorDisplayName: z.string().trim().min(1),
    sections: z.array(z.strictObject({ id, name: text(120).nullable(), position })).min(1),
    choiceGroups: z.array(z.strictObject({ id, sectionId: id, label: text(120) })),
    ingredients: z
      .array(
        z.strictObject({
          id,
          sectionId: id,
          choiceGroupId: id.nullable(),
          position,
          ingredientId: id.nullable(),
          ingredientName: z.string().trim().min(1),
          customIngredient: text(120).nullable(),
          quantityMin: amount,
          quantityMax: amount,
          quantityText: text(40).nullable(),
          unitId: id.nullable(),
          unitName: z.string().trim().min(1).nullable(),
          customUnit: text(40).nullable(),
          preparationNote: z.string().max(200).nullable(),
          isOptional: z.boolean(),
        }),
      )
      .min(1),
    steps: z
      .array(
        z.strictObject({
          id,
          position,
          instruction: text(2_000),
          conditionKind: z.enum(["choice_option", "optional_ingredient"]).nullable(),
          conditionIngredientId: id.nullable(),
          conditionLabel: z.string().nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((value, context) => {
    const invalid = (message: string) => context.addIssue({ code: "custom", message });
    const unique = (values: unknown[]) => new Set(values).size === values.length;
    const sections = new Map(value.sections.map((section) => [section.id, section]));
    const groups = new Map(value.choiceGroups.map((group) => [group.id, group]));
    const lines = new Map(value.ingredients.map((line) => [line.id, line]));
    if (
      !unique(value.sections.map((section) => section.id)) ||
      !unique(value.sections.map((section) => section.position)) ||
      !unique(value.choiceGroups.map((group) => group.id)) ||
      !unique(value.ingredients.map((line) => line.id)) ||
      !unique(value.ingredients.map((line) => `${line.sectionId}:${line.position}`)) ||
      !unique(value.steps.map((step) => step.id)) ||
      !unique(value.steps.map((step) => step.position))
    )
      invalid("Duplicate content identity or position.");
    const { yieldMin, yieldMax } = value.recipe;
    if (yieldMax !== null && (yieldMin === null || yieldMax < yieldMin))
      invalid("Invalid yield range.");
    for (const group of value.choiceGroups) {
      const options = value.ingredients.filter((line) => line.choiceGroupId === group.id);
      if (!sections.has(group.sectionId) || options.length < 2)
        invalid("Incomplete ingredient choice group.");
      const positions = options.map((line) => line.position).sort((a, b) => a - b);
      if (positions.some((value, index) => index > 0 && value !== positions[index - 1] + 1))
        invalid("Choice group options must remain together.");
    }
    for (const line of value.ingredients) {
      if (!sections.has(line.sectionId)) invalid("Ingredient section is unavailable.");
      if (
        line.choiceGroupId &&
        (line.isOptional || groups.get(line.choiceGroupId)?.sectionId !== line.sectionId)
      )
        invalid("Invalid ingredient choice relationship.");
      if (
        Number(line.ingredientId !== null) + Number(line.customIngredient !== null) !== 1 ||
        (line.unitId !== null && line.customUnit !== null)
      )
        invalid("Invalid ingredient or unit source.");
      if (
        line.quantityMax !== null &&
        (line.quantityMin === null || line.quantityMax < line.quantityMin)
      )
        invalid("Invalid ingredient quantity range.");
      if (line.quantityText !== null && line.quantityMin !== null)
        invalid("Conflicting quantity representations.");
      if ((line.unitId !== null || line.customUnit !== null) && line.unitName === null)
        invalid("Unit name is unavailable.");
    }
    for (const step of value.steps) {
      if ((step.conditionKind === null) !== (step.conditionIngredientId === null))
        invalid("Incomplete instruction condition.");
      if (step.conditionIngredientId) {
        const line = lines.get(step.conditionIngredientId);
        if (
          !line ||
          (step.conditionKind === "choice_option"
            ? !line.choiceGroupId
            : !line.isOptional || !!line.choiceGroupId)
        )
          invalid("Instruction condition is unavailable.");
      }
    }
  });

export type PublishedRecipeSnapshot = z.infer<typeof publishedRecipeSnapshotSchema>;
export const PUBLICATION_FORMAT_VERSION = 1;

export function parsePublishedRecipeSnapshot(formatVersion: number, snapshot: unknown) {
  if (formatVersion !== PUBLICATION_FORMAT_VERSION) return null;
  const parsed = publishedRecipeSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}
