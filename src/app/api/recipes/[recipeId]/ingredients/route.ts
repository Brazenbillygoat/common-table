import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import { createRecipeIngredientLine } from "@/server/recipes/manage-recipe-ingredients";
import {
  normalizeRecipeIngredient,
  recipeIngredientCreateRequestSchema,
} from "@/utils/recipe-ingredient";

import { authResponse, mutationErrorResponse, validationResponse } from "./responses";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  // Next.js provides dynamic route params as a promise.
  const { recipeId } = await params;
  if (!z.string().uuid().safeParse(recipeId).success) {
    return validationResponse({ recipeId: ["Invalid recipe ID."] });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse({});
  }
  const validation = recipeIngredientCreateRequestSchema.safeParse(body);
  if (!validation.success) {
    return validationResponse(validation.error.flatten().fieldErrors);
  }

  // API routes return JSON errors, so use getCurrentSession() instead of the redirecting page guard.
  const session = await getCurrentSession();
  if (!session) {
    return authResponse();
  }
  try {
    const result = await createRecipeIngredientLine({
      actorUserId: session.user.id,
      recipeId,
      expectedVersion: validation.data.expectedVersion,
      sectionId: validation.data.sectionId,
      input: normalizeRecipeIngredient(validation.data),
    });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return mutationErrorResponse(error, "createRecipeIngredientLine");
  }
}
