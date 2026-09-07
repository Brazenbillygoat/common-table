import "server-only";

import { getOwnedRecipeDetails } from "./get-owned-recipe-details";
import { getOwnedRecipeIngredientEditor } from "./get-owned-recipe-ingredient-editor";
import { getOwnedRecipeStepEditor } from "./get-owned-recipe-step-editor";

export async function getOwnedRecipePreview(recipeId: string, ownerId: string) {
  const [details, ingredientEditor, stepEditor] = await Promise.all([
    getOwnedRecipeDetails(recipeId, ownerId),
    getOwnedRecipeIngredientEditor(recipeId, ownerId),
    getOwnedRecipeStepEditor(recipeId, ownerId),
  ]);
  if (!details || !ingredientEditor || !stepEditor) return null;
  return {
    recipe: details,
    sections: ingredientEditor.sections ?? [],
    choiceGroups: ingredientEditor.choiceGroups ?? [],
    ingredients: ingredientEditor.lines,
    steps: stepEditor.steps,
  };
}
