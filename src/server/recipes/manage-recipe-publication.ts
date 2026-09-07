import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientChoiceGroup,
  recipeIngredientSection,
  recipePublication,
  recipeStep,
  unit,
  user,
} from "@/server/db/schema";
import {
  PUBLICATION_FORMAT_VERSION,
  publicationReadiness,
  publicationRequestSchema,
  publishedRecipeSnapshotSchema,
} from "@/utils/recipe-publication";

export class RecipePublicationError extends Error {
  constructor(
    readonly code:
      "RECIPE_NOT_FOUND" | "VERSION_CONFLICT" | "VALIDATION_ERROR" | "INCOMPLETE_RECIPE",
  ) {
    super(code);
    this.name = "RecipePublicationError";
  }
}

export async function getOwnedRecipePublication(recipeId: string, ownerId: string) {
  if (!z.string().uuid().safeParse(recipeId).success) return null;
  const [row] = await getDatabase()
    .select({
      version: recipe.version,
      status: recipe.status,
      sourceVersion: recipePublication.sourceVersion,
      publishedAt: recipePublication.publishedAt,
      slug: recipe.slug,
    })
    .from(recipe)
    .leftJoin(recipePublication, eq(recipePublication.recipeId, recipe.id))
    .where(
      and(
        eq(recipe.id, recipeId),
        eq(recipe.ownerId, ownerId),
        inArray(recipe.status, ["draft", "published"]),
      ),
    )
    .limit(1);
  return row && row.status !== "archived" ? { ...row, status: row.status } : null;
}

export async function changeRecipePublication({
  actorUserId,
  recipeId,
  expectedVersion,
  action,
}: {
  actorUserId: string;
  recipeId: string;
  expectedVersion: number;
  action: "publish" | "unpublish";
}) {
  if (!z.string().uuid().safeParse(recipeId).success)
    throw new RecipePublicationError("RECIPE_NOT_FOUND");
  if (!publicationRequestSchema.safeParse({ action, expectedVersion }).success)
    throw new RecipePublicationError("VALIDATION_ERROR");
  return getDatabase().transaction(async (transaction) => {
    // Every authoring mutation locks this same parent row before touching content.
    // Acquire it before the first content read, then compare the version after any wait.
    const [owned] = await transaction
      .select()
      .from(recipe)
      .where(
        and(
          eq(recipe.id, recipeId),
          eq(recipe.ownerId, actorUserId),
          inArray(recipe.status, ["draft", "published"]),
        ),
      )
      .for("update");
    if (!owned) throw new RecipePublicationError("RECIPE_NOT_FOUND");
    if (owned.version !== expectedVersion) throw new RecipePublicationError("VERSION_CONFLICT");
    const version = owned.version + 1;
    if (action === "unpublish") {
      await transaction.delete(recipePublication).where(eq(recipePublication.recipeId, recipeId));
      await transaction
        .update(recipe)
        .set({ status: "draft", publishedAt: null, version, updatedAt: new Date() })
        .where(eq(recipe.id, recipeId));
      return {
        version,
        status: "draft" as const,
        sourceVersion: null,
        publishedAt: null,
        slug: owned.slug,
      };
    }

    const sections = await transaction
      .select({
        id: recipeIngredientSection.id,
        name: recipeIngredientSection.name,
        position: recipeIngredientSection.position,
      })
      .from(recipeIngredientSection)
      .where(eq(recipeIngredientSection.recipeId, recipeId))
      .orderBy(asc(recipeIngredientSection.position));
    const choiceGroups = await transaction
      .select({
        id: recipeIngredientChoiceGroup.id,
        sectionId: recipeIngredientChoiceGroup.sectionId,
        label: recipeIngredientChoiceGroup.label,
      })
      .from(recipeIngredientChoiceGroup)
      .where(eq(recipeIngredientChoiceGroup.recipeId, recipeId));
    const ingredients = await transaction
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
      .innerJoin(
        recipeIngredientSection,
        eq(recipeIngredient.sectionId, recipeIngredientSection.id),
      )
      .leftJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.id))
      .leftJoin(unit, eq(recipeIngredient.unitId, unit.id))
      .where(eq(recipeIngredient.recipeId, recipeId))
      .orderBy(asc(recipeIngredientSection.position), asc(recipeIngredient.position));
    const steps = await transaction
      .select({
        id: recipeStep.id,
        position: recipeStep.position,
        instruction: recipeStep.instruction,
        conditionKind: recipeStep.conditionKind,
        conditionIngredientId: recipeStep.conditionIngredientId,
      })
      .from(recipeStep)
      .where(eq(recipeStep.recipeId, recipeId))
      .orderBy(asc(recipeStep.position));
    const [author] = await transaction
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, actorUserId));

    const recipeDetails = {
      id: owned.id,
      slug: owned.slug,
      title: owned.title,
      description: owned.description,
      yieldMin: owned.yieldMin,
      yieldMax: owned.yieldMax,
      yieldUnit: owned.yieldUnit,
    };
    if (publicationReadiness({ recipe: recipeDetails, ingredients, steps }).length)
      throw new RecipePublicationError("INCOMPLETE_RECIPE");
    const sectionPositions = new Map(sections.map((section) => [section.id, section.position]));
    choiceGroups.sort(
      (left, right) =>
        (sectionPositions.get(left.sectionId) ?? 0) -
          (sectionPositions.get(right.sectionId) ?? 0) ||
        (ingredients.find((line) => line.choiceGroupId === left.id)?.position ?? 0) -
          (ingredients.find((line) => line.choiceGroupId === right.id)?.position ?? 0),
    );
    const lines = ingredients.map(({ canonicalIngredientName, canonicalUnitName, ...line }) => ({
      ...line,
      ingredientName: canonicalIngredientName ?? line.customIngredient ?? "",
      unitName: canonicalUnitName ?? line.customUnit,
    }));
    const parsed = publishedRecipeSnapshotSchema.safeParse({
      recipe: recipeDetails,
      authorDisplayName: author?.name,
      sections,
      choiceGroups,
      ingredients: lines,
      steps: steps.map((step) => {
        const line = lines.find((line) => line.id === step.conditionIngredientId);
        const group = choiceGroups.find((group) => group.id === line?.choiceGroupId);
        return {
          ...step,
          conditionLabel: line ? `${group?.label ?? "Optional"}: ${line.ingredientName}` : null,
        };
      }),
    });
    if (!parsed.success) throw new RecipePublicationError("VALIDATION_ERROR");
    const publishedAt = new Date();
    // Publication participates in the shared counter. Its snapshot represents the
    // content at the resulting version; later private saves advance past this marker.
    const publication = {
      recipeId,
      snapshot: parsed.data,
      formatVersion: PUBLICATION_FORMAT_VERSION,
      sourceVersion: version,
      publishedAt,
    };
    await transaction
      .insert(recipePublication)
      .values(publication)
      .onConflictDoUpdate({ target: recipePublication.recipeId, set: publication });
    await transaction
      .update(recipe)
      .set({ status: "published", publishedAt, version, updatedAt: publishedAt })
      .where(eq(recipe.id, recipeId));
    return {
      version,
      status: "published" as const,
      sourceVersion: version,
      publishedAt,
      slug: owned.slug,
    };
  });
}
