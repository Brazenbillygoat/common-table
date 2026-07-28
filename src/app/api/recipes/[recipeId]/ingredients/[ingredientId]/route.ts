import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import {
  deleteRecipeIngredientLine,
  updateRecipeIngredientLine,
} from "@/server/recipes/manage-recipe-ingredients";
import {
  normalizeRecipeIngredient,
  recipeIngredientDeleteSchema,
  recipeIngredientRequestSchema,
} from "@/utils/recipe-ingredient";

import { authResponse, mutationErrorResponse, validationResponse } from "../responses";

type RouteContext = {
  params: Promise<{ recipeId: string; ingredientId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const route = await validateRoute(params);
  if (route instanceof Response) {
    return route;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse({});
  }
  const validation = recipeIngredientRequestSchema.safeParse(body);
  if (!validation.success) {
    return validationResponse(validation.error.flatten().fieldErrors);
  }
  const session = await getCurrentSession();
  if (!session) {
    return authResponse();
  }
  try {
    const result = await updateRecipeIngredientLine({
      actorUserId: session.user.id,
      ...route,
      expectedVersion: validation.data.expectedVersion,
      input: normalizeRecipeIngredient(validation.data),
    });
    return Response.json({ data: result });
  } catch (error) {
    return mutationErrorResponse(error, "updateRecipeIngredientLine");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const route = await validateRoute(params);
  if (route instanceof Response) {
    return route;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse({});
  }
  const validation = recipeIngredientDeleteSchema.safeParse(body);
  if (!validation.success) {
    return validationResponse(validation.error.flatten().fieldErrors);
  }
  const session = await getCurrentSession();
  if (!session) {
    return authResponse();
  }
  try {
    const result = await deleteRecipeIngredientLine({
      actorUserId: session.user.id,
      ...route,
      expectedVersion: validation.data.expectedVersion,
    });
    return Response.json({ data: result });
  } catch (error) {
    return mutationErrorResponse(error, "deleteRecipeIngredientLine");
  }
}

async function validateRoute(params: RouteContext["params"]) {
  const route = await params;
  const fieldErrors: Record<string, string[]> = {};
  if (!z.string().uuid().safeParse(route.recipeId).success) {
    fieldErrors.recipeId = ["Invalid recipe ID."];
  }
  if (!z.string().uuid().safeParse(route.ingredientId).success) {
    fieldErrors.ingredientId = ["Invalid ingredient ID."];
  }
  return Object.keys(fieldErrors).length > 0 ? validationResponse(fieldErrors) : route;
}
