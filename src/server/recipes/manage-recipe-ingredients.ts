import "server-only";

import { and, asc, eq, max, sql } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientSection,
  unit,
} from "@/server/db/schema";
import type { NormalizedRecipeIngredient, RecipeIngredientLine } from "@/utils/recipe-ingredient";

export type RecipeIngredientErrorCode =
  | "RECIPE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INGREDIENT_UNAVAILABLE"
  | "UNIT_UNAVAILABLE"
  | "INGREDIENT_SET_INVALID";

export class RecipeIngredientError extends Error {
  constructor(readonly code: RecipeIngredientErrorCode) {
    super(code);
    this.name = "RecipeIngredientError";
  }
}

interface MutationArguments {
  actorUserId: string;
  recipeId: string;
  expectedVersion: number;
}

interface WriteArguments extends MutationArguments {
  input: NormalizedRecipeIngredient;
}

interface UpdateArguments extends WriteArguments {
  ingredientId: string;
}

interface DeleteArguments extends MutationArguments {
  ingredientId: string;
}

interface ReorderArguments extends MutationArguments {
  ingredientIds: string[];
}

// Each mutation uses one transaction, so an error rolls back both the version and ingredient changes.
export async function createRecipeIngredientLine({
  actorUserId,
  recipeId,
  expectedVersion,
  input,
}: WriteArguments) {
  return getDatabase().transaction(async (transaction) => {
    await validateReferences(transaction, input);
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [section] = await transaction
      .select({ id: recipeIngredientSection.id })
      .from(recipeIngredientSection)
      .where(
        and(
          eq(recipeIngredientSection.recipeId, recipeId),
          eq(recipeIngredientSection.position, 0),
        ),
      )
      .limit(1);
    if (!section) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    const [positionResult] = await transaction
      .select({ maximum: max(recipeIngredient.position) })
      .from(recipeIngredient)
      .where(eq(recipeIngredient.sectionId, section.id));
    const position = (positionResult?.maximum ?? -1) + 1;
    const [created] = await transaction
      .insert(recipeIngredient)
      .values({ recipeId, sectionId: section.id, position, ...input })
      .returning({ id: recipeIngredient.id });
    if (!created) {
      throw new Error("Ingredient insert did not return a row.");
    }
    return {
      line: await loadSafeLine(transaction, recipeId, created.id),
      version,
    };
  });
}

export async function updateRecipeIngredientLine({
  actorUserId,
  recipeId,
  ingredientId,
  expectedVersion,
  input,
}: UpdateArguments) {
  return getDatabase().transaction(async (transaction) => {
    await validateReferences(transaction, input);
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [updated] = await transaction
      .update(recipeIngredient)
      .set(input)
      .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
      .returning({ id: recipeIngredient.id });
    if (!updated) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    return {
      line: await loadSafeLine(transaction, recipeId, ingredientId),
      version,
    };
  });
}

export async function deleteRecipeIngredientLine({
  actorUserId,
  recipeId,
  ingredientId,
  expectedVersion,
}: DeleteArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [deleted] = await transaction
      .delete(recipeIngredient)
      .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
      .returning({ id: recipeIngredient.id, sectionId: recipeIngredient.sectionId });
    if (!deleted) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    const remaining = await transaction
      .select({ id: recipeIngredient.id, position: recipeIngredient.position })
      .from(recipeIngredient)
      .where(
        and(
          eq(recipeIngredient.recipeId, recipeId),
          eq(recipeIngredient.sectionId, deleted.sectionId),
        ),
      )
      .orderBy(asc(recipeIngredient.position));
    for (const [position, line] of remaining.entries()) {
      if (line.position !== position) {
        await transaction
          .update(recipeIngredient)
          .set({ position })
          .where(eq(recipeIngredient.id, line.id));
      }
    }
    return {
      deletedIngredientId: deleted.id,
      ingredientIds: remaining.map((line) => line.id),
      version,
    };
  });
}

export async function reorderRecipeIngredientLines({
  actorUserId,
  recipeId,
  expectedVersion,
  ingredientIds,
}: ReorderArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [section] = await transaction
      .select({ id: recipeIngredientSection.id })
      .from(recipeIngredientSection)
      .where(
        and(
          eq(recipeIngredientSection.recipeId, recipeId),
          eq(recipeIngredientSection.position, 0),
        ),
      )
      .limit(1);
    if (!section) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    const current = await transaction
      .select({ id: recipeIngredient.id, position: recipeIngredient.position })
      .from(recipeIngredient)
      .where(
        and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.sectionId, section.id)),
      )
      .orderBy(asc(recipeIngredient.position));
    if (
      current.length !== ingredientIds.length ||
      current.some((line) => !ingredientIds.includes(line.id))
    ) {
      throw new RecipeIngredientError("INGREDIENT_SET_INVALID");
    }
    if (current.length > 0) {
      const maximumPosition = Math.max(...current.map((line) => line.position));
      const offset = maximumPosition + current.length + 1;
      // Move every row out of the final range first to avoid collisions with the unique position constraint.
      await transaction
        .update(recipeIngredient)
        .set({ position: sql`${recipeIngredient.position} + ${offset}` })
        .where(eq(recipeIngredient.sectionId, section.id));
      for (const [position, id] of ingredientIds.entries()) {
        await transaction
          .update(recipeIngredient)
          .set({ position })
          .where(
            and(
              eq(recipeIngredient.id, id),
              eq(recipeIngredient.recipeId, recipeId),
              eq(recipeIngredient.sectionId, section.id),
            ),
          );
      }
    }
    return { ingredientIds, version };
  });
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

async function validateReferences(transaction: Transaction, input: NormalizedRecipeIngredient) {
  // Recheck references here because an ingredient or unit may have been disabled since the form loaded.
  if (input.ingredientId) {
    const [activeIngredient] = await transaction
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(and(eq(ingredient.id, input.ingredientId), eq(ingredient.isActive, true)))
      .limit(1);
    if (!activeIngredient) {
      throw new RecipeIngredientError("INGREDIENT_UNAVAILABLE");
    }
  }
  if (input.unitId) {
    const [activeUnit] = await transaction
      .select({ id: unit.id })
      .from(unit)
      .where(and(eq(unit.id, input.unitId), eq(unit.isActive, true)))
      .limit(1);
    if (!activeUnit) {
      throw new RecipeIngredientError("UNIT_UNAVAILABLE");
    }
  }
}

async function advanceVersion(
  transaction: Transaction,
  recipeId: string,
  actorUserId: string,
  expectedVersion: number,
) {
  // This update checks ownership, draft status, and version before incrementing the version.
  const [updated] = await transaction
    .update(recipe)
    .set({ version: sql`${recipe.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(recipe.id, recipeId),
        eq(recipe.ownerId, actorUserId),
        eq(recipe.status, "draft"),
        eq(recipe.version, expectedVersion),
      ),
    )
    .returning({ version: recipe.version });
  if (updated) {
    return updated.version;
  }

  // Check again to tell stale data from unavailable data without revealing another user's recipe.
  const [ownedDraft] = await transaction
    .select({ id: recipe.id })
    .from(recipe)
    .where(
      and(eq(recipe.id, recipeId), eq(recipe.ownerId, actorUserId), eq(recipe.status, "draft")),
    )
    .limit(1);
  throw new RecipeIngredientError(ownedDraft ? "VERSION_CONFLICT" : "RECIPE_NOT_FOUND");
}

async function loadSafeLine(
  transaction: Transaction,
  recipeId: string,
  ingredientLineId: string,
): Promise<RecipeIngredientLine> {
  const [line] = await transaction
    .select({
      id: recipeIngredient.id,
      position: recipeIngredient.position,
      ingredientId: recipeIngredient.ingredientId,
      canonicalIngredientName: ingredient.name,
      customIngredient: recipeIngredient.customIngredient,
      quantityMin: recipeIngredient.quantityMin,
      quantityMax: recipeIngredient.quantityMax,
      quantityText: recipeIngredient.quantityText,
      unitId: recipeIngredient.unitId,
      canonicalUnitName: unit.name,
      customUnit: recipeIngredient.customUnit,
      preparationNote: recipeIngredient.preparationNote,
      isOptional: recipeIngredient.isOptional,
    })
    .from(recipeIngredient)
    .leftJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
    .leftJoin(unit, eq(recipeIngredient.unitId, unit.id))
    .where(and(eq(recipeIngredient.id, ingredientLineId), eq(recipeIngredient.recipeId, recipeId)))
    .limit(1);
  if (!line) {
    throw new RecipeIngredientError("RECIPE_NOT_FOUND");
  }
  return {
    id: line.id,
    position: line.position,
    ingredientId: line.ingredientId,
    ingredientName: line.canonicalIngredientName ?? line.customIngredient ?? "",
    customIngredient: line.customIngredient,
    quantityMin: line.quantityMin,
    quantityMax: line.quantityMax,
    quantityText: line.quantityText,
    unitId: line.unitId,
    unitName: line.canonicalUnitName ?? line.customUnit,
    customUnit: line.customUnit,
    preparationNote: line.preparationNote,
    isOptional: line.isOptional,
  };
}
