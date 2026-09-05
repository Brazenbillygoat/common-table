import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { recipe } from "@/server/db/schema";
import type { OwnedRecipeDetails } from "@/utils/recipe-details";

export async function getOwnedRecipeDetails(
  recipeId: string,
  ownerId: string,
): Promise<OwnedRecipeDetails | null> {
  if (!z.string().uuid().safeParse(recipeId).success) return null;

  const [ownedRecipe] = await getDatabase()
    .select({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      yieldMin: recipe.yieldMin,
      yieldMax: recipe.yieldMax,
      yieldUnit: recipe.yieldUnit,
      version: recipe.version,
    })
    .from(recipe)
    .where(
      and(
        eq(recipe.id, recipeId),
        eq(recipe.ownerId, ownerId),
        inArray(recipe.status, ["draft", "published"]),
      ),
    )
    .limit(1);

  return ownedRecipe ?? null;
}
