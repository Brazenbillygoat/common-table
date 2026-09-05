import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { recipe } from "@/server/db/schema";
import type { OwnedRecipeDetails } from "@/utils/recipe-details";

export async function getOwnedRecipeDetails(
  recipeId: string,
  ownerId: string,
): Promise<OwnedRecipeDetails | null> {
  if (!z.string().uuid().safeParse(recipeId).success) return null;

  const [ownedDraft] = await getDatabase()
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
    .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId), eq(recipe.status, "draft")))
    .limit(1);

  return ownedDraft ?? null;
}
