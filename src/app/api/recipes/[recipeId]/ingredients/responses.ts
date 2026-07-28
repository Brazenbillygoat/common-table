import { RecipeIngredientError } from "@/server/recipes/manage-recipe-ingredients";
import { ingredientMessages } from "@/utils/recipe-ingredient";

export function validationResponse(fieldErrors: Record<string, string[] | undefined>) {
  return Response.json({ error: { code: "VALIDATION_ERROR", fieldErrors } }, { status: 400 });
}

export function authResponse() {
  return Response.json(
    {
      error: {
        code: "AUTH_REQUIRED",
        message: "Your session expired. Sign in again to continue.",
      },
    },
    { status: 401 },
  );
}

export function mutationErrorResponse(error: unknown, operation: string) {
  if (error instanceof RecipeIngredientError) {
    if (error.code === "RECIPE_NOT_FOUND") {
      return Response.json(
        {
          error: {
            code: "RECIPE_NOT_FOUND",
            message: "This recipe draft is not available.",
          },
        },
        { status: 404 },
      );
    }
    if (error.code === "VERSION_CONFLICT") {
      return Response.json(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: "This draft changed elsewhere. Reload it before continuing.",
          },
        },
        { status: 409 },
      );
    }
    if (error.code === "INGREDIENT_UNAVAILABLE") {
      return validationResponse({
        ingredientId: [ingredientMessages.ingredientUnavailable],
      });
    }
    if (error.code === "UNIT_UNAVAILABLE") {
      return validationResponse({ unitId: [ingredientMessages.unitUnavailable] });
    }
    if (error.code === "INGREDIENT_SET_INVALID") {
      return validationResponse({
        ingredientIds: ["Submit every current ingredient exactly once."],
      });
    }
  }
  console.error("Ingredient mutation failed.", {
    operation,
    classification: "unexpected",
  });
  return Response.json(
    {
      error: {
        code: "INGREDIENT_CHANGE_FAILED",
        message: "We couldn’t save that ingredient change.",
      },
    },
    { status: 500 },
  );
}
