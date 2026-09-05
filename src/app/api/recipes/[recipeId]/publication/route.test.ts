import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecipePublicationError } from "@/server/recipes/manage-recipe-publication";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  changeRecipePublication: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/session", () => ({ getCurrentSession: mocks.getCurrentSession }));
vi.mock("@/server/recipes/manage-recipe-publication", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/recipes/manage-recipe-publication")>();
  return { ...original, changeRecipePublication: mocks.changeRecipePublication };
});

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const context = { params: Promise.resolve({ recipeId }) };
const url = `http://localhost/api/recipes/${recipeId}/publication`;
const publication = {
  version: 4,
  status: "published",
  sourceVersion: 4,
  publishedAt: "2026-09-04T18:00:00.000Z",
  slug: "chili",
};
function request(body: unknown = { action: "publish", expectedVersion: 3 }) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("recipe publication API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentSession.mockResolvedValue({
      user: { id: "trusted-owner", email: "private@example.invalid" },
      session: { token: "private-session-token" },
    });
    mocks.changeRecipePublication.mockResolvedValue(publication);
  });

  it("requires a session before mutation", async () => {
    mocks.getCurrentSession.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(401);
    expect(mocks.changeRecipePublication).not.toHaveBeenCalled();
  });

  it("rejects malformed IDs without mutation", async () => {
    const response = await POST(request(), { params: Promise.resolve({ recipeId: "invalid" }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "RECIPE_NOT_FOUND", message: "This recipe is not available." },
    });
    expect(mocks.changeRecipePublication).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid actions or concurrency versions", async () => {
    expect((await POST(new Request(url, { method: "POST", body: "{" }), context)).status).toBe(400);
    for (const expectedVersion of [0, -1, 1.5, "3", null, undefined]) {
      expect((await POST(request({ action: "publish", expectedVersion }), context)).status).toBe(
        400,
      );
    }
    expect((await POST(request({ action: "archive", expectedVersion: 3 }), context)).status).toBe(
      400,
    );
    expect(mocks.changeRecipePublication).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["publish", "unpublish"])(
    "uses server identity for %s and invalidates public and owner destinations",
    async (action) => {
      const response = await POST(
        request({
          action,
          expectedVersion: 3,
          ownerId: "attacker",
          snapshot: { title: "browser title" },
        }),
        context,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(await response.json()).toEqual({ publication });
      expect(mocks.changeRecipePublication).toHaveBeenCalledWith({
        actorUserId: "trusted-owner",
        recipeId,
        action,
        expectedVersion: 3,
      });
      expect(mocks.revalidatePath.mock.calls).toEqual([
        ["/"],
        ["/r/chili"],
        ["/recipes"],
        ...["details", "ingredients", "instructions", "preview"].map((stage) => [
          `/recipes/${recipeId}/edit/${stage}`,
        ]),
      ]);
    },
  );

  it.each([
    ["RECIPE_NOT_FOUND", 404],
    ["VERSION_CONFLICT", 409],
    ["VALIDATION_ERROR", 400],
    ["INCOMPLETE_RECIPE", 422],
  ] as const)("maps %s without revalidation or private recipe content", async (code, status) => {
    mocks.changeRecipePublication.mockRejectedValue(new RecipePublicationError(code));
    const response = await POST(request(), context);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code }) });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("omits private failure details from responses and logs, including authentication failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const privateError = new Error("private database credentials");
      mocks.changeRecipePublication.mockRejectedValue(privateError);
      const responses = [await POST(request(), context)];
      mocks.getCurrentSession.mockRejectedValue(privateError);
      responses.push(await POST(request(), context));
      for (const response of responses) {
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          error: {
            code: "PUBLICATION_REQUEST_FAILED",
            message: "We couldn't complete the publication request.",
          },
        });
      }
      expect(log.mock.calls).toEqual(
        Array.from({ length: 2 }, () => [
          "Recipe publication request failed.",
          { classification: "unexpected" },
        ]),
      );
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
