import "server-only";

import { eq, like, or } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe, recipeIngredientSection } from "@/server/db/schema";
import type { NormalizedRecipeDraft } from "@/utils/recipe-draft";
import { createRecipeSlugBase, selectLowestAvailableSlug } from "@/utils/recipe-slug";

const slugConstraint = "recipes_slug_unique";
const maximumRetries = 5;

interface CreateRecipeDraftArguments {
  actorUserId: string;
  input: NormalizedRecipeDraft;
}

export interface CreatedRecipeDraft {
  id: string;
  title: string;
  status: "draft";
  version: 1;
  editUrl: string;
}

function isSlugCollision(error: unknown) {
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const databaseError = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (databaseError.code === "23505" && databaseError.constraint === slugConstraint) {
      return true;
    }
    current = databaseError.cause;
  }

  return false;
}

export async function createRecipeDraft({
  actorUserId,
  input,
}: CreateRecipeDraftArguments): Promise<CreatedRecipeDraft> {
  const database = getDatabase();
  const baseSlug = createRecipeSlugBase(input.title);

  // Another request can claim this slug before the insert, so the unique constraint gets the final say.
  for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
    const existingRows = await database
      .select({ slug: recipe.slug })
      .from(recipe)
      .where(or(eq(recipe.slug, baseSlug), like(recipe.slug, `${baseSlug}-%`)));
    const slug = selectLowestAvailableSlug(
      baseSlug,
      existingRows.map((row) => row.slug),
    );

    try {
      // Create the draft and its first section together so neither can exist without the other.
      return await database.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(recipe)
          .values({
            ownerId: actorUserId,
            slug,
            title: input.title,
            description: input.description,
            status: "draft",
            yieldMin: input.yieldMin,
            yieldMax: input.yieldMax,
            yieldUnit: input.yieldUnit,
            version: 1,
            publishedAt: null,
          })
          .returning({
            id: recipe.id,
            title: recipe.title,
            status: recipe.status,
            version: recipe.version,
          });

        if (!created) {
          throw new Error("Recipe insert did not return a row.");
        }

        await transaction.insert(recipeIngredientSection).values({
          recipeId: created.id,
          name: null,
          position: 0,
        });

        return {
          id: created.id,
          title: created.title,
          status: "draft",
          version: 1,
          editUrl: `/recipes/${created.id}/edit/ingredients`,
        };
      });
    } catch (error) {
      // Only retry the slug collision. Other database errors need to reach the caller.
      if (!isSlugCollision(error) || attempt === maximumRetries) {
        throw error;
      }
    }
  }

  throw new Error("Recipe draft creation exhausted its retry limit.");
}

export { isSlugCollision };
