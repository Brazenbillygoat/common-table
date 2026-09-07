// @vitest-environment node

import "dotenv/config";

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/server/db/client";
import {
  recipe,
  recipeIngredient,
  recipeIngredientSection,
  recipeStep,
  user,
} from "@/server/db/schema";

import { createRecipeDraft } from "./create-recipe-draft";
import { getOwnedRecipe } from "./get-owned-recipe";
import { getOwnedRecipeDetails } from "./get-owned-recipe-details";
import { getOwnedRecipeIngredientEditor } from "./get-owned-recipe-ingredient-editor";
import { getOwnedRecipePreview } from "./get-owned-recipe-preview";
import { getOwnedRecipeStepEditor } from "./get-owned-recipe-step-editor";
import { listOwnedRecipeDrafts } from "./list-owned-recipe-drafts";
import { updateRecipeDetails } from "./update-recipe-details";

describe.each(["draft", "published"] as const)("%s Details PostgreSQL integration", (status) => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("persists details, preserves identity and content, and rejects unavailable or competing saves", async () => {
    const database = getDatabase();
    const fixtureId = crypto.randomUUID();
    const ownerId = `details-owner-${fixtureId}`;
    const otherOwnerId = `details-other-${fixtureId}`;
    let recipeId: string | undefined;

    try {
      // All account and recipe data is owned by this test; no private account
      // discovery or existing recipe mutation is needed to exercise authorization.
      await database.insert(user).values([
        { id: ownerId, name: "Details test owner", email: `${ownerId}@example.invalid` },
        { id: otherOwnerId, name: "Details test other", email: `${otherOwnerId}@example.invalid` },
      ]);
      const created = await createRecipeDraft({
        actorUserId: ownerId,
        input: {
          title: `Details integration ${fixtureId}`,
          description: null,
          yieldMin: null,
          yieldMax: null,
          yieldUnit: "servings",
        },
      });
      recipeId = created.id;
      await database
        .update(recipe)
        .set({ status, publishedAt: status === "published" ? new Date() : null })
        .where(eq(recipe.id, recipeId));
      expect(created.editUrl).toBe(`/recipes/${recipeId}/edit/ingredients`);
      const [initial] = await database.select().from(recipe).where(eq(recipe.id, recipeId));
      const [section] = await database
        .select({ id: recipeIngredientSection.id })
        .from(recipeIngredientSection)
        .where(eq(recipeIngredientSection.recipeId, recipeId));
      if (!initial || !section) throw new Error("The test draft was not created completely.");

      const [ingredient] = await database
        .insert(recipeIngredient)
        .values({
          recipeId,
          sectionId: section.id,
          position: 0,
          customIngredient: "Fixture beans",
          quantityMin: 2,
          quantityMax: 3,
          customUnit: "cups",
        })
        .returning();
      const [step] = await database
        .insert(recipeStep)
        .values({ recipeId, position: 0, instruction: "Stir the fixture beans." })
        .returning();
      const originalSections = await database
        .select()
        .from(recipeIngredientSection)
        .where(eq(recipeIngredientSection.recipeId, recipeId));

      expect(await getOwnedRecipeDetails(recipeId, ownerId)).toMatchObject({
        id: recipeId,
        description: null,
        yieldMin: null,
        yieldMax: null,
        yieldUnit: "servings",
        version: 1,
      });
      const single = await updateRecipeDetails({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 1,
        input: {
          title: " Single yield title ",
          description: " A saved family description. ",
          yieldMin: "4.500",
          yieldMax: "",
          yieldUnit: " bowls ",
        },
      });
      expect(single).toEqual({
        id: recipeId,
        title: "Single yield title",
        description: "A saved family description.",
        yieldMin: 4.5,
        yieldMax: null,
        yieldUnit: "bowls",
        version: 2,
      });
      expect(await getOwnedRecipeDetails(recipeId, ownerId)).toEqual(single);

      const rangedInput = {
        title: "Saved range title",
        description: "A saved range description.",
        yieldMin: "6",
        yieldMax: "8",
        yieldUnit: "portions",
      };
      const ranged = await updateRecipeDetails({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: single.version,
        input: rangedInput,
      });
      expect(ranged).toMatchObject({ yieldMin: 6, yieldMax: 8, yieldUnit: "portions", version: 3 });
      expect(await getOwnedRecipeDetails(recipeId, ownerId)).toEqual(ranged);
      expect(await getOwnedRecipe(recipeId, ownerId)).toMatchObject({ id: recipeId, status });
      expect((await getOwnedRecipePreview(recipeId, ownerId))?.recipe).toEqual(ranged);
      expect(await listOwnedRecipeDrafts(ownerId)).toEqual([
        expect.objectContaining({ id: recipeId, title: ranged.title, version: 3 }),
      ]);
      expect((await getOwnedRecipeIngredientEditor(recipeId, ownerId))?.recipe.title).toBe(
        ranged.title,
      );
      expect((await getOwnedRecipeStepEditor(recipeId, ownerId))?.recipe.title).toBe(ranged.title);

      const [afterRange] = await database.select().from(recipe).where(eq(recipe.id, recipeId));
      expect(afterRange).toEqual({
        ...initial,
        title: ranged.title,
        description: ranged.description,
        yieldMin: ranged.yieldMin,
        yieldMax: ranged.yieldMax,
        yieldUnit: ranged.yieldUnit,
        version: ranged.version,
        updatedAt: expect.any(Date),
      });
      expect(afterRange.updatedAt.getTime()).toBeGreaterThanOrEqual(initial.updatedAt.getTime());
      expect(
        await database
          .select()
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, recipeId)),
      ).toEqual([ingredient]);
      expect(
        await database.select().from(recipeStep).where(eq(recipeStep.recipeId, recipeId)),
      ).toEqual([step]);
      expect(
        await database
          .select()
          .from(recipeIngredientSection)
          .where(eq(recipeIngredientSection.recipeId, recipeId)),
      ).toEqual(originalSections);

      await expect(
        updateRecipeDetails({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 2,
          input: { ...rangedInput, title: "Stale overwrite" },
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      await expect(
        updateRecipeDetails({
          actorUserId: otherOwnerId,
          recipeId,
          expectedVersion: 3,
          input: { ...rangedInput, title: "Unauthorized overwrite" },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      await expect(getOwnedRecipeDetails(recipeId, otherOwnerId)).resolves.toBeNull();
      const missingId = crypto.randomUUID();
      await expect(getOwnedRecipeDetails(missingId, ownerId)).resolves.toBeNull();
      await expect(
        updateRecipeDetails({
          actorUserId: ownerId,
          recipeId: missingId,
          expectedVersion: 3,
          input: rangedInput,
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      await expect(
        updateRecipeDetails({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 3,
          input: { ...rangedInput, yieldMin: "1/2" },
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(await getOwnedRecipeDetails(recipeId, ownerId)).toEqual(ranged);

      const results = await Promise.allSettled([
        updateRecipeDetails({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 3,
          input: { ...rangedInput, title: "Concurrent save A" },
        }),
        updateRecipeDetails({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 3,
          input: { ...rangedInput, title: "Concurrent save B" },
        }),
      ]);
      const successful = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ code: "VERSION_CONFLICT" });
      expect(await getOwnedRecipeDetails(recipeId, ownerId)).toEqual(successful[0].value);
      expect(successful[0].value.version).toBe(4);

      const cleared = await updateRecipeDetails({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 4,
        input: {
          title: "No fixed yield",
          description: " ",
          yieldMin: "",
          yieldMax: "",
          yieldUnit: " ",
        },
      });
      expect(cleared).toMatchObject({
        description: null,
        yieldMin: null,
        yieldMax: null,
        yieldUnit: "servings",
        version: 5,
      });
      expect(await getOwnedRecipeDetails(recipeId, ownerId)).toEqual(cleared);

      await database.update(recipe).set({ status: "archived" }).where(eq(recipe.id, recipeId));
      await expect(getOwnedRecipe(recipeId, ownerId)).resolves.toBeNull();
      await expect(getOwnedRecipeDetails(recipeId, ownerId)).resolves.toBeNull();
      await expect(getOwnedRecipeIngredientEditor(recipeId, ownerId)).resolves.toBeNull();
      await expect(getOwnedRecipeStepEditor(recipeId, ownerId)).resolves.toBeNull();
      await expect(getOwnedRecipePreview(recipeId, ownerId)).resolves.toBeNull();
      await expect(
        updateRecipeDetails({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 5,
          input: rangedInput,
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      const [unavailable] = await database.select().from(recipe).where(eq(recipe.id, recipeId));
      expect(unavailable).toMatchObject({ title: cleared.title, version: 5, status: "archived" });
    } finally {
      if (recipeId) await database.delete(recipe).where(eq(recipe.id, recipeId));
      await database.delete(user).where(inArray(user.id, [ownerId, otherOwnerId]));
    }
  });
});
