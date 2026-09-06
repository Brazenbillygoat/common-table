import "server-only";

import { eq } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { recipe, recipePublication } from "@/server/db/schema";
import { parsePublishedRecipeSnapshot } from "@/utils/recipe-publication";
import { rankRecipePublications, type SearchablePublication } from "@/utils/recipe-search";
import { parseRecipeSearch, type SearchParameters } from "@/utils/recipe-search-query";

export async function searchPublishedRecipes(parameters: SearchParameters) {
  const parsed = parseRecipeSearch(parameters);
  if (!parsed.ok) return parsed;
  // One fresh collection read is enough for this small cookbook. Never use
  // editable recipe values or current reference names as searchable fallbacks.
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
    .where(eq(recipe.status, "published"));
  const publications: SearchablePublication[] = [];
  for (const row of rows) {
    const snapshot = parsePublishedRecipeSnapshot(row.formatVersion, row.snapshot);
    if (snapshot && snapshot.recipe.id === row.recipeId && snapshot.recipe.slug === row.slug)
      publications.push({ snapshot, publishedAt: row.publishedAt });
  }
  const matches = rankRecipePublications(publications, parsed.query);
  const offset = (parsed.query.page - 1) * 20;
  return {
    ok: true as const,
    query: parsed.query,
    total: matches.length,
    hasNextPage: offset + 20 < matches.length,
    recipes: matches
      .slice(offset, offset + 20)
      .map(({ publication: { snapshot }, explanations }) => ({
        slug: snapshot.recipe.slug,
        title: snapshot.recipe.title,
        description: snapshot.recipe.description,
        authorDisplayName: snapshot.authorDisplayName,
        explanations,
      })),
  };
}
