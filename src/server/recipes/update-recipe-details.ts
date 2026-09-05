import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import { recipe } from "@/server/db/schema";
import { recipeDetailsRequestSchema, type OwnedRecipeDetails } from "@/utils/recipe-details";
import { normalizeRecipeDraft, type RecipeDraftRequest } from "@/utils/recipe-draft";

type RecipeDetailsErrorCode = "RECIPE_NOT_FOUND" | "VERSION_CONFLICT" | "VALIDATION_ERROR";

export class RecipeDetailsError extends Error {
  constructor(
    readonly code: RecipeDetailsErrorCode,
    readonly fieldErrors: Record<string, string[] | undefined> = {},
  ) {
    super(code);
    this.name = "RecipeDetailsError";
  }
}

export async function updateRecipeDetails({
  actorUserId,
  recipeId,
  expectedVersion,
  input,
}: {
  actorUserId: string;
  recipeId: string;
  expectedVersion: number;
  input: RecipeDraftRequest;
}): Promise<OwnedRecipeDetails> {
  if (!z.string().uuid().safeParse(recipeId).success) {
    throw new RecipeDetailsError("RECIPE_NOT_FOUND");
  }
  const validation = recipeDetailsRequestSchema.safeParse({ ...input, expectedVersion });
  if (!validation.success) {
    throw new RecipeDetailsError("VALIDATION_ERROR", validation.error.flatten().fieldErrors);
  }
  const details = normalizeRecipeDraft(validation.data);
  const database = getDatabase();

  // Fields and the shared save counter change in one conditional statement. A competing
  // ingredient, instruction, or Details save can therefore never be overwritten silently.
  const [updated] = await database
    .update(recipe)
    .set({
      title: details.title,
      description: details.description,
      yieldMin: details.yieldMin,
      yieldMax: details.yieldMax,
      yieldUnit: details.yieldUnit,
      version: sql`${recipe.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(recipe.id, recipeId),
        eq(recipe.ownerId, actorUserId),
        eq(recipe.status, "draft"),
        eq(recipe.version, expectedVersion),
      ),
    )
    .returning({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      yieldMin: recipe.yieldMin,
      yieldMax: recipe.yieldMax,
      yieldUnit: recipe.yieldUnit,
      version: recipe.version,
    });
  if (updated) return updated;

  // Only an owned draft may reveal that its version changed. All other cases
  // share the unavailable result, including published and archived recipes.
  const [ownedDraft] = await database
    .select({ id: recipe.id })
    .from(recipe)
    .where(
      and(eq(recipe.id, recipeId), eq(recipe.ownerId, actorUserId), eq(recipe.status, "draft")),
    )
    .limit(1);
  throw new RecipeDetailsError(ownedDraft ? "VERSION_CONFLICT" : "RECIPE_NOT_FOUND");
}
