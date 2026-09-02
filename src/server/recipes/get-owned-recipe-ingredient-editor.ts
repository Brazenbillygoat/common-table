import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredientChoiceGroup,
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

  const [sections, choiceGroups, lines, ingredientOptions, unitOptions] = await Promise.all([
    database
      .select({
        id: recipeIngredientSection.id,
        name: recipeIngredientSection.name,
        position: recipeIngredientSection.position,
      })
      .from(recipeIngredientSection)
      .where(eq(recipeIngredientSection.recipeId, recipeId))
      .orderBy(asc(recipeIngredientSection.position)),
    database
      .select({
        id: recipeIngredientChoiceGroup.id,
        sectionId: recipeIngredientChoiceGroup.sectionId,
        label: recipeIngredientChoiceGroup.label,
      })
      .from(recipeIngredientChoiceGroup)
      .where(eq(recipeIngredientChoiceGroup.recipeId, recipeId)),
    database
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
      .orderBy(asc(recipeIngredientSection.position), asc(recipeIngredient.position)),
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

  if (sections.length === 0) {
    return null;
  }
  const sectionPositions = new Map(sections.map((section) => [section.id, section.position]));
  const groupPositions = new Map<string, number>();
  for (const line of lines) {
    if (line.choiceGroupId && !groupPositions.has(line.choiceGroupId)) {
      groupPositions.set(line.choiceGroupId, line.position);
    }
  }
  choiceGroups.sort(
    (left, right) =>
      (sectionPositions.get(left.sectionId) ?? 0) - (sectionPositions.get(right.sectionId) ?? 0) ||
      (groupPositions.get(left.id) ?? 0) - (groupPositions.get(right.id) ?? 0),
  );

  return {
    recipe: ownedRecipe,
    sections,
    choiceGroups,
    lines: lines.map((line) => ({
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
    })),
    ingredientOptions,
    unitOptions,
  };
}
