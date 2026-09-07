import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import {
  changeRecipePublication,
  RecipePublicationError,
} from "@/server/recipes/manage-recipe-publication";
import { publicationRequestSchema } from "@/utils/recipe-publication";

type RouteContext = { params: Promise<{ recipeId: string }> };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function unavailable() {
  return json(
    { error: { code: "RECIPE_NOT_FOUND", message: "This recipe is not available." } },
    404,
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentSession();
    if (!session)
      return json({ error: { code: "AUTH_REQUIRED", message: "Sign in again to continue." } }, 401);
    const { recipeId } = await params;
    if (!z.string().uuid().safeParse(recipeId).success) return unavailable();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: "VALIDATION_ERROR" } }, 400);
    }
    const validation = publicationRequestSchema.safeParse(body);
    if (!validation.success) return json({ error: { code: "VALIDATION_ERROR" } }, 400);
    const publication = await changeRecipePublication({
      actorUserId: session.user.id,
      recipeId,
      action: validation.data.action,
      expectedVersion: validation.data.expectedVersion,
    });
    revalidatePath("/");
    revalidatePath(`/r/${publication.slug}`);
    revalidatePath("/recipes");
    for (const stage of ["details", "ingredients", "instructions", "preview"]) {
      revalidatePath(`/recipes/${recipeId}/edit/${stage}`);
    }
    return json({ publication });
  } catch (error) {
    if (error instanceof RecipePublicationError) {
      if (error.code === "RECIPE_NOT_FOUND") return unavailable();
      if (error.code === "VERSION_CONFLICT")
        return json(
          {
            error: {
              code: error.code,
              message: "This recipe changed elsewhere. Reload before continuing.",
            },
          },
          409,
        );
      if (error.code === "VALIDATION_ERROR") return json({ error: { code: error.code } }, 400);
      if (error.code === "INCOMPLETE_RECIPE")
        return json(
          {
            error: {
              code: error.code,
              message: "Add a valid title, an ingredient, and an instruction before publishing.",
            },
          },
          422,
        );
    }
    // Never log database errors, sessions, submitted content, or account data.
    console.error("Recipe publication request failed.", { classification: "unexpected" });
    return json(
      {
        error: {
          code: "PUBLICATION_REQUEST_FAILED",
          message: "We couldn't complete the publication request.",
        },
      },
      500,
    );
  }
}
