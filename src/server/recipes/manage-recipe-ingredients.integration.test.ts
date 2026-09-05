// @vitest-environment node

import "dotenv/config";

import { and, asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/server/db/client";
import { ingredient, recipe, recipeIngredient, unit, user } from "@/server/db/schema";

import { createRecipeDraft } from "./create-recipe-draft";
import { getOwnedRecipeIngredientEditor } from "./get-owned-recipe-ingredient-editor";
import { listOwnedRecipeDrafts } from "./list-owned-recipe-drafts";
import {
  createRecipeIngredientLine,
  deleteRecipeIngredientLine,
  reorderRecipeIngredientLines,
  updateRecipeIngredientLine,
} from "./manage-recipe-ingredients";

describe.each(["draft", "published"] as const)("PostgreSQL ingredients (%s)", (status) => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("persists, versions, reorders, deletes, conflicts, and rolls back", async () => {
    const database = getDatabase();
    const ownerId = `ingredient-owner-${crypto.randomUUID()}`;
    const [canonicalIngredient] = await database
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(eq(ingredient.isActive, true))
      .limit(1);
    const [canonicalUnit] = await database
      .select({ id: unit.id })
      .from(unit)
      .where(eq(unit.isActive, true))
      .limit(1);
    if (!canonicalIngredient || !canonicalUnit) {
      throw new Error("Integration test requires active reference rows.");
    }

    let recipeId: string | undefined;
    try {
      await database.insert(user).values({
        id: ownerId,
        name: "Ingredient test owner",
        email: `${ownerId}@example.invalid`,
      });
      const created = await createRecipeDraft({
        actorUserId: ownerId,
        input: {
          title: `Ingredient integration ${crypto.randomUUID()}`,
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
      const [initialRecipe] = await database
        .select({ updatedAt: recipe.updatedAt })
        .from(recipe)
        .where(eq(recipe.id, recipeId));
      const ownedDrafts = await listOwnedRecipeDrafts(ownerId);
      expect(ownedDrafts).toContainEqual(
        expect.objectContaining({
          id: recipeId,
          title: created.title,
          version: 1,
        }),
      );

      const first = await createRecipeIngredientLine({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 1,
        input: {
          ingredientId: canonicalIngredient.id,
          customIngredient: null,
          quantityMin: 1.25,
          quantityMax: null,
          quantityText: null,
          unitId: canonicalUnit.id,
          customUnit: null,
          preparationNote: "chopped",
          isOptional: false,
        },
      });
      const second = await createRecipeIngredientLine({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 2,
        input: {
          ingredientId: null,
          customIngredient: "Family spice",
          quantityMin: null,
          quantityMax: null,
          quantityText: "to taste",
          unitId: null,
          customUnit: null,
          preparationNote: null,
          isOptional: true,
        },
      });
      expect(first.version).toBe(2);
      expect(second.version).toBe(3);
      const [mutatedRecipe] = await database
        .select({ updatedAt: recipe.updatedAt })
        .from(recipe)
        .where(eq(recipe.id, recipeId));
      expect(mutatedRecipe?.updatedAt.getTime()).toBeGreaterThan(
        initialRecipe?.updatedAt.getTime() ?? 0,
      );
      const editor = await getOwnedRecipeIngredientEditor(recipeId, ownerId);
      expect(editor?.recipe).toEqual({
        id: recipeId,
        title: created.title,
        version: 3,
      });
      expect(editor?.lines.map((line) => line.id)).toEqual([first.line.id, second.line.id]);
      expect(editor?.ingredientOptions.length).toBeGreaterThan(0);
      expect(editor?.unitOptions.length).toBeGreaterThan(0);
      await expect(getOwnedRecipeIngredientEditor(recipeId, "another-user")).resolves.toBeNull();
      await expect(
        deleteRecipeIngredientLine({
          actorUserId: "another-user",
          recipeId,
          ingredientId: first.line.id,
          expectedVersion: 3,
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });

      const updated = await updateRecipeIngredientLine({
        actorUserId: ownerId,
        recipeId,
        ingredientId: first.line.id,
        expectedVersion: 3,
        input: {
          ingredientId: canonicalIngredient.id,
          customIngredient: null,
          quantityMin: 2,
          quantityMax: 4,
          quantityText: null,
          unitId: canonicalUnit.id,
          customUnit: null,
          preparationNote: null,
          isOptional: false,
        },
      });
      expect(updated.line.position).toBe(0);
      expect(updated.version).toBe(4);

      const reordered = await reorderRecipeIngredientLines({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 4,
        ingredientIds: [second.line.id, first.line.id],
      });
      expect(reordered.version).toBe(5);
      const storedOrder = await database
        .select({ id: recipeIngredient.id, position: recipeIngredient.position })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, recipeId))
        .orderBy(asc(recipeIngredient.position));
      expect(storedOrder).toEqual([
        { id: second.line.id, position: 0 },
        { id: first.line.id, position: 1 },
      ]);

      await expect(
        deleteRecipeIngredientLine({
          actorUserId: ownerId,
          recipeId,
          ingredientId: first.line.id,
          expectedVersion: 4,
        }),
      ).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
      expect(
        await database
          .select({ id: recipeIngredient.id })
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, recipeId)),
      ).toHaveLength(2);

      await expect(
        updateRecipeIngredientLine({
          actorUserId: ownerId,
          recipeId,
          ingredientId: crypto.randomUUID(),
          expectedVersion: 5,
          input: {
            ingredientId: canonicalIngredient.id,
            customIngredient: null,
            quantityMin: null,
            quantityMax: null,
            quantityText: null,
            unitId: null,
            customUnit: null,
            preparationNote: null,
            isOptional: false,
          },
        }),
      ).rejects.toMatchObject({
        code: "RECIPE_NOT_FOUND",
      });
      const [afterRollback] = await database
        .select({ version: recipe.version })
        .from(recipe)
        .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId)));
      expect(afterRollback?.version).toBe(5);

      const deleted = await deleteRecipeIngredientLine({
        actorUserId: ownerId,
        recipeId,
        ingredientId: second.line.id,
        expectedVersion: 5,
      });
      expect(deleted).toEqual({
        deletedIngredientId: second.line.id,
        ingredientIds: [first.line.id],
        version: 6,
      });
      const [remaining] = await database
        .select({
          position: recipeIngredient.position,
          ingredientId: recipeIngredient.ingredientId,
          customIngredient: recipeIngredient.customIngredient,
        })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, recipeId));
      expect(remaining).toEqual({
        position: 0,
        ingredientId: canonicalIngredient.id,
        customIngredient: null,
      });

      await database.update(recipe).set({ status: "archived" }).where(eq(recipe.id, recipeId));
      await expect(getOwnedRecipeIngredientEditor(recipeId, ownerId)).resolves.toBeNull();
      await expect(
        deleteRecipeIngredientLine({
          actorUserId: ownerId,
          recipeId,
          ingredientId: first.line.id,
          expectedVersion: 6,
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      expect(
        await database
          .select({ version: recipe.version })
          .from(recipe)
          .where(eq(recipe.id, recipeId)),
      ).toEqual([{ version: 6 }]);
      expect(
        await database
          .select({ id: recipeIngredient.id })
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, recipeId)),
      ).toEqual([{ id: first.line.id }]);
    } finally {
      if (recipeId) {
        await database.delete(recipe).where(eq(recipe.id, recipeId));
      }
      await database.delete(user).where(eq(user.id, ownerId));
    }
  });
});
