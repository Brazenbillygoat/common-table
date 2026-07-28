import { getCurrentSession } from "@/server/auth/session";
import { createRecipeDraft } from "@/server/recipes/create-recipe-draft";
import { normalizeRecipeDraft, recipeDraftSchema } from "@/utils/recipe-draft";

const validationError = {
  error: {
    code: "VALIDATION_ERROR",
    fieldErrors: {},
  },
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(validationError, { status: 400 });
  }

  const validation = recipeDraftSchema.safeParse(body);
  if (!validation.success) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          fieldErrors: validation.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const session = await getCurrentSession();
  if (!session) {
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

  try {
    const created = await createRecipeDraft({
      actorUserId: session.user.id,
      input: normalizeRecipeDraft(validation.data),
    });

    return Response.json({ data: created }, { status: 201 });
  } catch {
    console.error("Recipe draft creation failed.", {
      operation: "createRecipeDraft",
    });
    return Response.json(
      {
        error: {
          code: "CREATE_FAILED",
          message: "We couldn’t start this recipe.",
        },
      },
      { status: 500 },
    );
  }
}
