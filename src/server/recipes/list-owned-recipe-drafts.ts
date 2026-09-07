import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe, recipePublication } from "@/server/db/schema";

export async function listOwnedRecipeDrafts(ownerId: string) {
  const rows = await getDatabase()
    .select({
      id: recipe.id,
      title: recipe.title,
      version: recipe.version,
      status: recipe.status,
      slug: recipe.slug,
      sourceVersion: recipePublication.sourceVersion,
      updatedAt: recipe.updatedAt,
    })
    .from(recipe)
    .leftJoin(recipePublication, eq(recipePublication.recipeId, recipe.id))
    .where(and(eq(recipe.ownerId, ownerId), inArray(recipe.status, ["draft", "published"])))
    .orderBy(desc(recipe.updatedAt), asc(recipe.title), asc(recipe.id));
  return rows.map((row) => ({
    ...row,
    unpublishedChanges: row.status === "published" && row.version !== row.sourceVersion,
  }));
}
