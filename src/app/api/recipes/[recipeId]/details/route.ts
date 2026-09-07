import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import { getOwnedRecipeDetails } from "@/server/recipes/get-owned-recipe-details";
import { RecipeDetailsError, updateRecipeDetails } from "@/server/recipes/update-recipe-details";
import { recipeDetailsRequestSchema } from "@/utils/recipe-details";

type RouteContext = { params: Promise<{ recipeId: string }> };

const privateHeaders = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}

function unavailable() {
  return json(
    {
      error: { code: "RECIPE_NOT_FOUND", message: "This recipe draft is not available." },
    },
    404,
  );
}

function authRequired() {
  return json(
    {
      error: {
        code: "AUTH_REQUIRED",
        message: "Your session expired. Sign in again to continue.",
      },
    },
    401,
  );
}

function validationError(fieldErrors: Record<string, string[] | undefined>) {
  return json({ error: { code: "VALIDATION_ERROR", fieldErrors } }, 400);
}

function failure(error: unknown) {
  if (error instanceof RecipeDetailsError) {
    if (error.code === "RECIPE_NOT_FOUND") return unavailable();
    if (error.code === "VALIDATION_ERROR") return validationError(error.fieldErrors);
    if (error.code === "VERSION_CONFLICT") {
      return json(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: "This draft changed elsewhere. Reload it before continuing.",
          },
        },
        409,
      );
    }
  }
  // Do not log database errors, sessions, submitted recipe content, or account data.
  console.error("Recipe details request failed.", { classification: "unexpected" });
  return json(
    { error: { code: "DETAILS_REQUEST_FAILED", message: "We couldn't load or save this draft." } },
    500,
  );
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return authRequired();
    const { recipeId } = await params;
    if (!z.string().uuid().safeParse(recipeId).success) return unavailable();
    const recipe = await getOwnedRecipeDetails(recipeId, session.user.id);
    return recipe ? json({ recipe }) : unavailable();
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session) return authRequired();
    const { recipeId } = await params;
    if (!z.string().uuid().safeParse(recipeId).success) return unavailable();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return validationError({});
    }
    const validation = recipeDetailsRequestSchema.safeParse(body);
    if (!validation.success) return validationError(validation.error.flatten().fieldErrors);
    const recipe = await updateRecipeDetails({
      actorUserId: session.user.id,
      recipeId,
      expectedVersion: validation.data.expectedVersion,
      input: validation.data,
    });
    revalidatePath("/recipes");
    for (const stage of ["details", "ingredients", "instructions", "preview"]) {
      revalidatePath(`/recipes/${recipeId}/edit/${stage}`);
    }
    return json({ recipe });
  } catch (error) {
    return failure(error);
  }
}
