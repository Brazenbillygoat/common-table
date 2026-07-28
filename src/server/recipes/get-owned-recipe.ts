import "server-only";

import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe } from "@/server/db/schema";

export async function getOwnedRecipe(recipeId: string, ownerId: string) {
  const [ownedRecipe] = await getDatabase()
    .select({
      id: recipe.id,
      title: recipe.title,
      status: recipe.status,
      version: recipe.version,
    })
    .from(recipe)
    .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId)))
    .limit(1);

  return ownedRecipe ?? null;
}
