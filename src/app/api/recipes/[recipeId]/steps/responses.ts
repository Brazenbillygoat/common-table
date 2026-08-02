import { RecipeStepError } from "@/server/recipes/manage-recipe-steps";

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
  if (error instanceof RecipeStepError) {
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
    if (error.code === "STEP_SET_INVALID") {
      return validationResponse({
        stepIds: ["Submit every current step exactly once."],
      });
    }
  }
  console.error("Step mutation failed.", { operation, classification: "unexpected" });
  return Response.json(
    {
      error: {
        code: "STEP_CHANGE_FAILED",
        message: "We couldn't save that instruction change.",
      },
    },
    { status: 500 },
  );
}
