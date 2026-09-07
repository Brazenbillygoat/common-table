import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { recipe, recipePublication } from "@/server/db/schema";
import { parsePublishedRecipeSnapshot } from "@/utils/recipe-publication";
import { createManifest, OFFLINE_LIMITS, type SavedRecipe } from "@/utils/offline-protocol";

export async function readOfflinePublications() {
  // Both bounded metadata and content reads use one PostgreSQL snapshot. No
  // publication can be silently added, removed or replaced halfway through it.
  return getDatabase().transaction(
    async (tx) => {
      const rows = await tx
        .select({
          id: recipe.id,
          slug: recipe.slug,
          bytes: sql<number>`octet_length(${recipePublication.snapshot}::text)`,
        })
        .from(recipe)
        .leftJoin(recipePublication, eq(recipe.id, recipePublication.recipeId))
        .where(eq(recipe.status, "published"))
        .orderBy(asc(recipe.id))
        .limit(OFFLINE_LIMITS.recipes + 1);
      if (
        rows.length > OFFLINE_LIMITS.recipes ||
        rows.some((row) => !row.bytes) ||
        rows.reduce((sum, row) => sum + Number(row.bytes), 0) > OFFLINE_LIMITS.data
      ) {
        throw new Error("The published collection is incomplete or exceeds offline limits.");
      }
      const publications = rows.length
        ? await tx
            .select()
            .from(recipePublication)
            .where(
              inArray(
                recipePublication.recipeId,
                rows.map((row) => row.id),
              ),
            )
        : [];
      const identities = new Map(rows.map((row) => [row.id, row.slug]));
      const recipes: SavedRecipe[] = publications.map((row) => {
        const snapshot = parsePublishedRecipeSnapshot(row.formatVersion, row.snapshot);
        if (
          !snapshot ||
          snapshot.recipe.id !== row.recipeId ||
          identities.get(row.recipeId) !== snapshot.recipe.slug
        ) {
          throw new Error("A published recipe is invalid or needs a newer app.");
        }
        return { snapshot, publishedAt: row.publishedAt.toISOString() };
      });
      if (recipes.length !== rows.length) throw new Error("Incomplete published collection.");
      return { manifest: await createManifest(recipes), recipes };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function downloadOfflinePublications(
  revision: string,
  known: Array<{ id: string; fingerprint: string }>,
) {
  const collection = await readOfflinePublications();
  if (revision !== collection.manifest.revision) return null;
  const fingerprints = new Map(known.map((item) => [item.id, item.fingerprint]));
  const changed = new Set(
    collection.manifest.entries
      .filter((entry) => fingerprints.get(entry.id) !== entry.fingerprint)
      .map((entry) => entry.id),
  );
  return {
    manifest: collection.manifest,
    recipes: collection.recipes.filter((item) => changed.has(item.snapshot.recipe.id)),
  };
}
