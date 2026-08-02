import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe, recipeStep } from "@/server/db/schema";
import type { RecipeStepEditorData } from "@/utils/recipe-step";

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

  const steps = await database
    .select({
      id: recipeStep.id,
      position: recipeStep.position,
      instruction: recipeStep.instruction,
    })
    .from(recipeStep)
    .where(eq(recipeStep.recipeId, recipeId))
    .orderBy(asc(recipeStep.position));

  return { recipe: ownedRecipe, steps };
}
