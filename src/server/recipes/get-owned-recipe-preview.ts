import "server-only";

import { getOwnedRecipeIngredientEditor } from "./get-owned-recipe-ingredient-editor";
import { getOwnedRecipeStepEditor } from "./get-owned-recipe-step-editor";

export async function getOwnedRecipePreview(recipeId: string, ownerId: string) {
  const [ingredientEditor, stepEditor] = await Promise.all([
    getOwnedRecipeIngredientEditor(recipeId, ownerId),
    getOwnedRecipeStepEditor(recipeId, ownerId),
  ]);
  if (!ingredientEditor || !stepEditor) return null;
  return {
    recipe: ingredientEditor.recipe,
    sections: ingredientEditor.sections ?? [],
    choiceGroups: ingredientEditor.choiceGroups ?? [],
    ingredients: ingredientEditor.lines,
    steps: stepEditor.steps,
  };
}
