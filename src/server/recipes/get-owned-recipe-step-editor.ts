import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientChoiceGroup,
  recipeStep,
} from "@/server/db/schema";
import type { RecipeStepConditionOption, RecipeStepEditorData } from "@/utils/recipe-step";

export async function getOwnedRecipeStepEditor(
  recipeId: string,
  ownerId: string,
): Promise<RecipeStepEditorData | null> {
  const database = getDatabase();
  const [ownedRecipe] = await database
    .select({ id: recipe.id, title: recipe.title, version: recipe.version })
    .from(recipe)
    .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId), eq(recipe.status, "draft")))
    .limit(1);

  if (!ownedRecipe) {
    return null;
  }

  const [steps, ingredientConditions] = await Promise.all([
    database
      .select({
        id: recipeStep.id,
        position: recipeStep.position,
        instruction: recipeStep.instruction,
        conditionKind: recipeStep.conditionKind,
        conditionIngredientId: recipeStep.conditionIngredientId,
      })
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, recipeId))
      .orderBy(asc(recipeStep.position)),
    database
      .select({
        id: recipeIngredient.id,
        choiceGroupId: recipeIngredient.choiceGroupId,
        groupLabel: recipeIngredientChoiceGroup.label,
        isOptional: recipeIngredient.isOptional,
        canonicalName: ingredient.name,
        customName: recipeIngredient.customIngredient,
      })
      .from(recipeIngredient)
      .leftJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
      .leftJoin(
        recipeIngredientChoiceGroup,
        eq(recipeIngredient.choiceGroupId, recipeIngredientChoiceGroup.id),
      )
      .where(eq(recipeIngredient.recipeId, recipeId))
      .orderBy(asc(recipeIngredient.sectionId), asc(recipeIngredient.position)),
  ]);

  const conditionOptions = ingredientConditions.flatMap<RecipeStepConditionOption>((line) => {
    const ingredientName = line.canonicalName ?? line.customName ?? "Ingredient";
    if (line.choiceGroupId && line.groupLabel) {
      return [
        {
          id: line.id,
          kind: "choice_option" as const,
          label: `${line.groupLabel}: ${ingredientName}`,
        },
      ];
    }
    if (line.isOptional) {
      return [
        {
          id: line.id,
          kind: "optional_ingredient" as const,
          label: `Optional: ${ingredientName}`,
        },
      ];
    }
    return [];
  });
  const labels = new Map(conditionOptions.map((option) => [option.id, option.label]));

  return {
    recipe: ownedRecipe,
    steps: steps.map((step) => ({
      ...step,
      conditionLabel: step.conditionIngredientId
        ? (labels.get(step.conditionIngredientId) ?? "Unavailable condition")
        : null,
    })),
    conditionOptions,
  };
}
