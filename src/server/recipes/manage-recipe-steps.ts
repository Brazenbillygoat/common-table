import "server-only";

import { and, asc, eq, max, sql } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe, recipeStep } from "@/server/db/schema";
import type { NormalizedRecipeStep, RecipeStep } from "@/utils/recipe-step";

export type RecipeStepErrorCode = "RECIPE_NOT_FOUND" | "VERSION_CONFLICT" | "STEP_SET_INVALID";

export class RecipeStepError extends Error {
  constructor(readonly code: RecipeStepErrorCode) {
    super(code);
    this.name = "RecipeStepError";
  }
}

interface MutationArguments {
  actorUserId: string;
  recipeId: string;
  expectedVersion: number;
}

interface WriteArguments extends MutationArguments {
  input: NormalizedRecipeStep;
}

interface UpdateArguments extends WriteArguments {
  stepId: string;
}

interface DeleteArguments extends MutationArguments {
  stepId: string;
}

interface ReorderArguments extends MutationArguments {
  stepIds: string[];
}

export async function createRecipeStep({
  actorUserId,
  recipeId,
  expectedVersion,
  input,
}: WriteArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [positionResult] = await transaction
      .select({ maximum: max(recipeStep.position) })
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, recipeId));
    const position = (positionResult?.maximum ?? -1) + 1;
    const [step] = await transaction
      .insert(recipeStep)
      .values({ recipeId, position, instruction: input.instruction })
      .returning({
        id: recipeStep.id,
        position: recipeStep.position,
        instruction: recipeStep.instruction,
      });
    if (!step) {
      throw new Error("Step insert did not return a row.");
    }
    return { step, version };
  });
}

export async function updateRecipeStep({
  actorUserId,
  recipeId,
  stepId,
  expectedVersion,
  input,
}: UpdateArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [step] = await transaction
      .update(recipeStep)
      .set({ instruction: input.instruction })
      .where(and(eq(recipeStep.id, stepId), eq(recipeStep.recipeId, recipeId)))
      .returning({
        id: recipeStep.id,
        position: recipeStep.position,
        instruction: recipeStep.instruction,
      });
    if (!step) {
      throw new RecipeStepError("RECIPE_NOT_FOUND");
    }
    return { step, version };
  });
}

export async function deleteRecipeStep({
  actorUserId,
  recipeId,
  stepId,
  expectedVersion,
}: DeleteArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const [deleted] = await transaction
      .delete(recipeStep)
      .where(and(eq(recipeStep.id, stepId), eq(recipeStep.recipeId, recipeId)))
      .returning({ id: recipeStep.id });
    if (!deleted) {
      throw new RecipeStepError("RECIPE_NOT_FOUND");
    }
    const remaining = await transaction
      .select({ id: recipeStep.id, position: recipeStep.position })
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, recipeId))
      .orderBy(asc(recipeStep.position));
    for (const [position, step] of remaining.entries()) {
      if (step.position !== position) {
        await transaction.update(recipeStep).set({ position }).where(eq(recipeStep.id, step.id));
      }
    }
    return { deletedStepId: deleted.id, stepIds: remaining.map((step) => step.id), version };
  });
}

export async function reorderRecipeSteps({
  actorUserId,
  recipeId,
  expectedVersion,
  stepIds,
}: ReorderArguments) {
  return getDatabase().transaction(async (transaction) => {
    const version = await advanceVersion(transaction, recipeId, actorUserId, expectedVersion);
    const current = await transaction
      .select({ id: recipeStep.id, position: recipeStep.position })
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, recipeId))
      .orderBy(asc(recipeStep.position));
    if (
      new Set(stepIds).size !== stepIds.length ||
      current.length !== stepIds.length ||
      current.some((step) => !stepIds.includes(step.id))
    ) {
      throw new RecipeStepError("STEP_SET_INVALID");
    }
    if (current.length > 0) {
      const maximumPosition = Math.max(...current.map((step) => step.position));
      const offset = maximumPosition + current.length + 1;
      await transaction
        .update(recipeStep)
        .set({ position: sql`${recipeStep.position} + ${offset}` })
        .where(eq(recipeStep.recipeId, recipeId));
      for (const [position, id] of stepIds.entries()) {
        await transaction
          .update(recipeStep)
          .set({ position })
          .where(and(eq(recipeStep.id, id), eq(recipeStep.recipeId, recipeId)));
      }
    }
    return { stepIds, version };
  });
}

type Transaction = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

async function advanceVersion(
  transaction: Transaction,
  recipeId: string,
  actorUserId: string,
  expectedVersion: number,
) {
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
  const [ownedDraft] = await transaction
    .select({ id: recipe.id })
    .from(recipe)
    .where(
      and(eq(recipe.id, recipeId), eq(recipe.ownerId, actorUserId), eq(recipe.status, "draft")),
    )
    .limit(1);
  throw new RecipeStepError(ownedDraft ? "VERSION_CONFLICT" : "RECIPE_NOT_FOUND");
}

export type RecipeStepMutationResult = { step: RecipeStep; version: number };
