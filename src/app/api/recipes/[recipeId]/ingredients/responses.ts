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
    if (error.code === "CONTENT_REFERENCED") {
      return Response.json(
        {
          error: {
            code: error.code,
            message:
              "Reassign or delete the linked instruction blocks before changing this ingredient structure.",
            linkedSteps: error.details?.linkedSteps ?? [],
          },
        },
        { status: 409 },
      );
    }
    if (error.code === "GROUP_MINIMUM") {
      return Response.json(
        {
          error: {
            code: error.code,
            message: "An alternative needs at least two options. Ungroup it or delete the group.",
          },
        },
        { status: 409 },
      );
    }
    if (error.code === "GROUP_OPTION_OPTIONAL") {
      return validationResponse({
        isOptional: ["An alternative option cannot also be optional."],
      });
    }
    if (error.code === "SECTION_NOT_FOUND" || error.code === "GROUP_NOT_FOUND") {
      return Response.json(
        { error: { code: error.code, message: "This recipe structure is no longer available." } },
        { status: 404 },
      );
    }
    if (error.code === "DUPLICATE_SECTION") {
      return validationResponse({ name: ["Section names must be unique."] });
    }
    if (error.code === "UNNAMED_SECTION_REQUIRES_NAME") {
      return validationResponse({
        name: ["Name the existing ingredient section before adding another section."],
      });
    }
    if (error.code === "LAST_SECTION") {
      return validationResponse({ sectionId: ["A recipe must keep at least one section."] });
    }
    if (error.code === "STRUCTURE_INVALID") {
      return validationResponse({
        action: ["Reload the current ingredient structure and try again."],
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
