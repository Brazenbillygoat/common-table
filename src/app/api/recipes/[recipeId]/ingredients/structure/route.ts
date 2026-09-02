import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import { mutateRecipeIngredientStructure } from "@/server/recipes/manage-recipe-ingredient-structure";
import { recipeIngredientStructureRequestSchema } from "@/utils/recipe-ingredient";

import { authResponse, mutationErrorResponse, validationResponse } from "../responses";

export async function PUT(request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
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
  const validation = recipeIngredientStructureRequestSchema.safeParse(body);
  if (!validation.success) {
    return validationResponse(validation.error.flatten().fieldErrors);
  }
  const session = await getCurrentSession();
  if (!session) return authResponse();
  try {
    const result = await mutateRecipeIngredientStructure({
      actorUserId: session.user.id,
      recipeId,
      expectedVersion: validation.data.expectedVersion,
      action: validation.data.action,
    });
    return Response.json({ data: result });
  } catch (error) {
    return mutationErrorResponse(error, "mutateRecipeIngredientStructure");
  }
}
