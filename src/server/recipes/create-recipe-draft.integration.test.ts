// @vitest-environment node

import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/server/db/client";
import { recipe, recipeIngredientSection, user } from "@/server/db/schema";

import { createRecipeDraft } from "./create-recipe-draft";

describe("createRecipeDraft PostgreSQL integration", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("persists an owned draft and unnamed section", async () => {
    const database = getDatabase();
    const [existingUser] = await database.select({ id: user.id }).from(user).limit(1);

    if (!existingUser) {
      throw new Error("The database integration test requires one existing local user.");
    }

    const uniqueTitle = `Database integration recipe ${crypto.randomUUID()}`;
    let createdId: string | undefined;

    try {
      const created = await createRecipeDraft({
        actorUserId: existingUser.id,
        input: {
          title: uniqueTitle,
          description: null,
          yieldMin: 2,
          yieldMax: 4,
          yieldUnit: "servings",
        },
      });
      createdId = created.id;

      const [storedRecipe] = await database
        .select({
          ownerId: recipe.ownerId,
          status: recipe.status,
          version: recipe.version,
          publishedAt: recipe.publishedAt,
        })
        .from(recipe)
        .where(eq(recipe.id, created.id));
      const [storedSection] = await database
        .select({
          name: recipeIngredientSection.name,
          position: recipeIngredientSection.position,
        })
        .from(recipeIngredientSection)
        .where(eq(recipeIngredientSection.recipeId, created.id));

      expect(storedRecipe).toEqual({
        ownerId: existingUser.id,
        status: "draft",
        version: 1,
        publishedAt: null,
      });
      expect(storedSection).toEqual({ name: null, position: 0 });
    } finally {
      if (createdId) {
        await database.delete(recipe).where(eq(recipe.id, createdId));
      }
    }
  });
});
