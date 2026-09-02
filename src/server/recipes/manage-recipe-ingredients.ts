import "server-only";

import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientSection,
  recipeStep,
  unit,
} from "@/server/db/schema";
import type { NormalizedRecipeIngredient, RecipeIngredientLine } from "@/utils/recipe-ingredient";

export type RecipeIngredientErrorCode =
  | "RECIPE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INGREDIENT_UNAVAILABLE"
  | "UNIT_UNAVAILABLE"
  | "INGREDIENT_SET_INVALID"
  | "CONTENT_REFERENCED"
  | "GROUP_MINIMUM"
  | "GROUP_OPTION_OPTIONAL"
  | "SECTION_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "STRUCTURE_INVALID"
  | "DUPLICATE_SECTION"
  | "UNNAMED_SECTION_REQUIRES_NAME"
  | "LAST_SECTION";

export interface LinkedRecipeStep {
  id: string;
  position: number;
  instruction: string;
}

export class RecipeIngredientError extends Error {
  constructor(
    readonly code: RecipeIngredientErrorCode,
    readonly details?: { linkedSteps?: LinkedRecipeStep[] },
  ) {
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
  sectionId?: string;
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
  sectionId,
}: WriteArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceRecipeVersion(transaction, recipeId, actorUserId, expectedVersion);
    await validateIngredientReferences(transaction, input);
    const sectionConditions = [eq(recipeIngredientSection.recipeId, recipeId)];
    if (sectionId) {
      sectionConditions.push(eq(recipeIngredientSection.id, sectionId));
    } else {
      sectionConditions.push(eq(recipeIngredientSection.position, 0));
    }
    const [section] = await transaction
      .select({ id: recipeIngredientSection.id })
      .from(recipeIngredientSection)
      .where(and(...sectionConditions))
      .limit(1);
    if (!section) {
      throw new RecipeIngredientError(sectionId ? "SECTION_NOT_FOUND" : "RECIPE_NOT_FOUND");
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
      line: await loadSafeIngredientLine(transaction, recipeId, created.id),
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
    const version = await advanceRecipeVersion(transaction, recipeId, actorUserId, expectedVersion);
    await validateIngredientReferences(transaction, input);
    const [current] = await transaction
      .select({
        choiceGroupId: recipeIngredient.choiceGroupId,
        isOptional: recipeIngredient.isOptional,
      })
      .from(recipeIngredient)
      .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
      .limit(1);
    if (!current) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    if (current.choiceGroupId && input.isOptional) {
      throw new RecipeIngredientError("GROUP_OPTION_OPTIONAL");
    }
    if (current.isOptional && !input.isOptional) {
      const linkedSteps = await loadLinkedSteps(transaction, recipeId, [ingredientId]);
      if (linkedSteps.length > 0) {
        throw new RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps });
      }
    }
    const [updated] = await transaction
      .update(recipeIngredient)
      .set(input)
      .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
      .returning({ id: recipeIngredient.id });
    if (!updated) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    return {
      line: await loadSafeIngredientLine(transaction, recipeId, ingredientId),
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
    const version = await advanceRecipeVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [current] = await transaction
      .select({
        id: recipeIngredient.id,
        sectionId: recipeIngredient.sectionId,
        choiceGroupId: recipeIngredient.choiceGroupId,
      })
      .from(recipeIngredient)
      .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
      .limit(1);
    if (!current) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    const linkedSteps = await loadLinkedSteps(transaction, recipeId, [ingredientId]);
    if (linkedSteps.length > 0) {
      throw new RecipeIngredientError("CONTENT_REFERENCED", { linkedSteps });
    }
    if (current.choiceGroupId) {
      const [groupCount] = await transaction
        .select({ value: count() })
        .from(recipeIngredient)
        .where(
          and(
            eq(recipeIngredient.recipeId, recipeId),
            eq(recipeIngredient.choiceGroupId, current.choiceGroupId),
          ),
        );
      if ((groupCount?.value ?? 0) <= 2) {
        throw new RecipeIngredientError("GROUP_MINIMUM");
      }
    }
    const [deleted] = await transaction
      .delete(recipeIngredient)
      .where(and(eq(recipeIngredient.id, ingredientId), eq(recipeIngredient.recipeId, recipeId)))
      .returning({ id: recipeIngredient.id, sectionId: recipeIngredient.sectionId });
    if (!deleted) {
      throw new RecipeIngredientError("RECIPE_NOT_FOUND");
    }
    const remaining = await transaction
      .select({
        id: recipeIngredient.id,
        position: recipeIngredient.position,
        choiceGroupId: recipeIngredient.choiceGroupId,
      })
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
    const version = await advanceRecipeVersion(transaction, recipeId, actorUserId, expectedVersion);
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
      .select({
        id: recipeIngredient.id,
        position: recipeIngredient.position,
        choiceGroupId: recipeIngredient.choiceGroupId,
      })
      .from(recipeIngredient)
      .where(
        and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.sectionId, section.id)),
      )
      .orderBy(asc(recipeIngredient.position));
    if (
      current.length !== ingredientIds.length ||
      current.some((line) => !ingredientIds.includes(line.id)) ||
      current.some((line) => line.choiceGroupId !== null)
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

export async function validateIngredientReferences(
  transaction: Transaction,
  input: NormalizedRecipeIngredient,
) {
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

export async function advanceRecipeVersion(
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

export async function loadSafeIngredientLine(
  transaction: Transaction,
  recipeId: string,
  ingredientLineId: string,
): Promise<RecipeIngredientLine> {
  const [line] = await transaction
    .select({
      id: recipeIngredient.id,
      sectionId: recipeIngredient.sectionId,
      choiceGroupId: recipeIngredient.choiceGroupId,
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
    sectionId: line.sectionId,
    choiceGroupId: line.choiceGroupId,
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

export async function loadLinkedSteps(
  transaction: Transaction,
  recipeId: string,
  ingredientIds: string[],
): Promise<LinkedRecipeStep[]> {
  if (ingredientIds.length === 0) return [];
  return transaction
    .select({
      id: recipeStep.id,
      position: recipeStep.position,
      instruction: recipeStep.instruction,
    })
    .from(recipeStep)
    .where(
      and(
        eq(recipeStep.recipeId, recipeId),
        inArray(recipeStep.conditionIngredientId, ingredientIds),
      ),
    )
    .orderBy(asc(recipeStep.position));
}
