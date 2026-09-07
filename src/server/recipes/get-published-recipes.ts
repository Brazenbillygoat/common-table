import "server-only";

import { asc, desc, eq, and } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe, recipePublication } from "@/server/db/schema";
import { parsePublishedRecipeSnapshot } from "@/utils/recipe-publication";

export async function getPublishedRecipe(slug: string) {
  const [row] = await getDatabase()
    .select({
      recipeId: recipe.id,
      formatVersion: recipePublication.formatVersion,
      snapshot: recipePublication.snapshot,
    })
    .from(recipePublication)
    .innerJoin(recipe, eq(recipePublication.recipeId, recipe.id))
    .where(and(eq(recipe.slug, slug), eq(recipe.status, "published")))
    .limit(1);
  if (!row) return null;
  const snapshot = parsePublishedRecipeSnapshot(row.formatVersion, row.snapshot);
  return snapshot?.recipe.id === row.recipeId && snapshot.recipe.slug === slug ? snapshot : null;
}

export async function listPublishedRecipes(requestedPage = 1) {
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 20;
  const recipes: Array<{
    slug: string;
    title: string;
    description: string | null;
    authorDisplayName: string;
    publishedAt: Date;
  }> = [];
  let validCount = 0;
  // Invalid snapshots fail closed without consuming visible page slots. Fetch in
  // bounded batches so a damaged row cannot hide subsequent valid publications.
  for (let offset = 0; recipes.length <= pageSize; offset += 100) {
    const rows = await getDatabase()
      .select({
        recipeId: recipe.id,
        slug: recipe.slug,
        snapshot: recipePublication.snapshot,
        formatVersion: recipePublication.formatVersion,
        publishedAt: recipePublication.publishedAt,
      })
      .from(recipePublication)
      .innerJoin(recipe, eq(recipePublication.recipeId, recipe.id))
      .where(eq(recipe.status, "published"))
      .orderBy(desc(recipePublication.publishedAt), asc(recipePublication.recipeId))
      .limit(100)
      .offset(offset);
    for (const row of rows) {
      const snapshot = parsePublishedRecipeSnapshot(row.formatVersion, row.snapshot);
      if (!snapshot || snapshot.recipe.id !== row.recipeId || snapshot.recipe.slug !== row.slug)
        continue;
      if (validCount++ < (page - 1) * pageSize) continue;
      recipes.push({
        slug: snapshot.recipe.slug,
        title: snapshot.recipe.title,
        description: snapshot.recipe.description,
        authorDisplayName: snapshot.authorDisplayName,
        publishedAt: row.publishedAt,
      });
      if (recipes.length > pageSize) break;
    }
    if (rows.length < 100) break;
  }
  return { recipes: recipes.slice(0, pageSize), page, hasNextPage: recipes.length > pageSize };
}
