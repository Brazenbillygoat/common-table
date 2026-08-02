import { z } from "zod";

import { getCurrentSession } from "@/server/auth/session";
import { deleteRecipeStep, updateRecipeStep } from "@/server/recipes/manage-recipe-steps";
import {
  normalizeRecipeStep,
  recipeStepDeleteSchema,
  recipeStepRequestSchema,
} from "@/utils/recipe-step";

import { authResponse, mutationErrorResponse, validationResponse } from "../responses";

type RouteContext = { params: Promise<{ recipeId: string; stepId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const route = await validateRoute(params);
  if (route instanceof Response) return route;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse({});
  }
  const validation = recipeStepRequestSchema.safeParse(body);
  if (!validation.success) {
    return validationResponse(validation.error.flatten().fieldErrors);
  }
  const session = await getCurrentSession();
  if (!session) return authResponse();
  try {
    const result = await updateRecipeStep({
      actorUserId: session.user.id,
      ...route,
      expectedVersion: validation.data.expectedVersion,
      input: normalizeRecipeStep(validation.data),
    });
    return Response.json({ data: result });
  } catch (error) {
    return mutationErrorResponse(error, "updateRecipeStep");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const route = await validateRoute(params);
  if (route instanceof Response) return route;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse({});
  }
  const validation = recipeStepDeleteSchema.safeParse(body);
  if (!validation.success) {
    return validationResponse(validation.error.flatten().fieldErrors);
  }
  const session = await getCurrentSession();
  if (!session) return authResponse();
  try {
    const result = await deleteRecipeStep({
      actorUserId: session.user.id,
      ...route,
      expectedVersion: validation.data.expectedVersion,
    });
    return Response.json({ data: result });
  } catch (error) {
    return mutationErrorResponse(error, "deleteRecipeStep");
  }
}

async function validateRoute(params: RouteContext["params"]) {
  const route = await params;
  const fieldErrors: Record<string, string[]> = {};
  if (!z.string().uuid().safeParse(route.recipeId).success) {
    fieldErrors.recipeId = ["Invalid recipe ID."];
  }
  if (!z.string().uuid().safeParse(route.stepId).success) {
    fieldErrors.stepId = ["Invalid step ID."];
  }
  return Object.keys(fieldErrors).length > 0 ? validationResponse(fieldErrors) : route;
}
