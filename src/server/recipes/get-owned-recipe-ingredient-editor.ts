import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientSection,
  unit,
} from "@/server/db/schema";
import type { RecipeIngredientEditorData } from "@/utils/recipe-ingredient";

export async function getOwnedRecipeIngredientEditor(
  recipeId: string,
  ownerId: string,
): Promise<RecipeIngredientEditorData | null> {
  const database = getDatabase();
  const [ownedRecipe] = await database
    .select({ id: recipe.id, title: recipe.title, version: recipe.version })
    .from(recipe)
    .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId), eq(recipe.status, "draft")))
    .limit(1);

  if (!ownedRecipe) {
    return null;
  }

  const [section] = await database
    .select({ id: recipeIngredientSection.id })
    .from(recipeIngredientSection)
    .where(
      and(eq(recipeIngredientSection.recipeId, recipeId), eq(recipeIngredientSection.position, 0)),
    )
    .limit(1);

  if (!section) {
    return null;
  }

  const [lines, ingredientOptions, unitOptions] = await Promise.all([
    database
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
      .where(
        and(eq(recipeIngredient.recipeId, recipeId), eq(recipeIngredient.sectionId, section.id)),
      )
      .orderBy(asc(recipeIngredient.position)),
    database
      .select({ id: ingredient.id, name: ingredient.name })
      .from(ingredient)
      .where(eq(ingredient.isActive, true))
      .orderBy(asc(ingredient.name)),
    database
      .select({ id: unit.id, name: unit.name, kind: unit.kind })
      .from(unit)
      .where(eq(unit.isActive, true))
      .orderBy(asc(unit.kind), asc(unit.name)),
  ]);

  return {
    recipe: ownedRecipe,
    lines: lines.map((line) => ({
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
    })),
    ingredientOptions,
    unitOptions,
  };
}
