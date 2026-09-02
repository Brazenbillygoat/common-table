// @vitest-environment node

import "dotenv/config";

import { and, asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/server/db/client";
import { recipe, recipeStep, user } from "@/server/db/schema";

import { createRecipeDraft } from "./create-recipe-draft";
import { getOwnedRecipeStepEditor } from "./get-owned-recipe-step-editor";
import {
  createRecipeStep,
  deleteRecipeStep,
  reorderRecipeSteps,
  updateRecipeStep,
} from "./manage-recipe-steps";

describe("recipe step PostgreSQL integration", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("persists, reads, versions, reorders, conflicts, deletes, and rolls back", async () => {
    const database = getDatabase();
    const [existingUser] = await database.select({ id: user.id }).from(user).limit(1);
    if (!existingUser) {
      throw new Error("Integration test requires one existing user.");
    }

    let recipeId: string | undefined;
    try {
      const created = await createRecipeDraft({
        actorUserId: existingUser.id,
        input: {
          title: `Step integration ${crypto.randomUUID()}`,
          description: null,
          yieldMin: null,
          yieldMax: null,
          yieldUnit: "servings",
        },
      });
      recipeId = created.id;
      const [initial] = await database
        .select({ updatedAt: recipe.updatedAt })
        .from(recipe)
        .where(eq(recipe.id, recipeId));

      const first = await createRecipeStep({
        actorUserId: existingUser.id,
        recipeId,
        expectedVersion: 1,
        input: { instruction: "Mix  gently.\nKeep warm." },
      });
      const second = await createRecipeStep({
        actorUserId: existingUser.id,
        recipeId,
        expectedVersion: 2,
        input: { instruction: "Serve." },
      });
      expect(first).toEqual({
        step: {
          id: expect.any(String),
          position: 0,
          instruction: "Mix  gently.\nKeep warm.",
          conditionKind: null,
          conditionIngredientId: null,
        },
        version: 2,
      });
      expect(second.step.position).toBe(1);
      expect(second.version).toBe(3);
      const [afterCreate] = await database
        .select({ ownerId: recipe.ownerId, version: recipe.version, updatedAt: recipe.updatedAt })
        .from(recipe)
        .where(eq(recipe.id, recipeId));
      expect(afterCreate?.ownerId).toBe(existingUser.id);
      expect(afterCreate?.version).toBe(3);
      expect(afterCreate?.updatedAt.getTime()).toBeGreaterThan(initial?.updatedAt.getTime() ?? 0);

      const editor = await getOwnedRecipeStepEditor(recipeId, existingUser.id);
      expect(editor).toEqual({
        recipe: { id: recipeId, title: created.title, version: 3 },
        steps: [
          { ...first.step, conditionLabel: null },
          { ...second.step, conditionLabel: null },
        ],
        conditionOptions: [],
      });
      await expect(getOwnedRecipeStepEditor(recipeId, "another-user")).resolves.toBeNull();
      await expect(
        createRecipeStep({
          actorUserId: "another-user",
          recipeId,
          expectedVersion: 3,
          input: { instruction: "Unauthorized." },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      const [afterUnauthorizedMutation] = await database
        .select({ version: recipe.version })
        .from(recipe)
        .where(eq(recipe.id, recipeId));
      expect(afterUnauthorizedMutation?.version).toBe(3);
      expect(
        await database
          .select({ id: recipeStep.id })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId)),
      ).toHaveLength(2);

      const updated = await updateRecipeStep({
        actorUserId: existingUser.id,
        recipeId,
        stepId: first.step.id,
        expectedVersion: 3,
        input: { instruction: "Mix thoroughly." },
      });
      expect(updated.step).toEqual({
        id: first.step.id,
        position: 0,
        instruction: "Mix thoroughly.",
        conditionKind: null,
        conditionIngredientId: null,
      });
      expect(updated.version).toBe(4);

      const reordered = await reorderRecipeSteps({
        actorUserId: existingUser.id,
        recipeId,
        expectedVersion: 4,
        stepIds: [second.step.id, first.step.id],
      });
      expect(reordered.version).toBe(5);
      expect(
        await database
          .select({ id: recipeStep.id, position: recipeStep.position })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId))
          .orderBy(asc(recipeStep.position)),
      ).toEqual([
        { id: second.step.id, position: 0 },
        { id: first.step.id, position: 1 },
      ]);

      await expect(
        updateRecipeStep({
          actorUserId: existingUser.id,
          recipeId,
          stepId: first.step.id,
          expectedVersion: 4,
          input: { instruction: "Stale." },
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect(
        await database
          .select({ instruction: recipeStep.instruction })
          .from(recipeStep)
          .where(eq(recipeStep.id, first.step.id)),
      ).toEqual([{ instruction: "Mix thoroughly." }]);

      await expect(
        updateRecipeStep({
          actorUserId: existingUser.id,
          recipeId,
          stepId: crypto.randomUUID(),
          expectedVersion: 5,
          input: { instruction: "Missing." },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      const [afterRollback] = await database
        .select({ version: recipe.version })
        .from(recipe)
        .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, existingUser.id)));
      expect(afterRollback?.version).toBe(5);
      expect(
        await database
          .select({ id: recipeStep.id, instruction: recipeStep.instruction })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId)),
      ).toHaveLength(2);

      const deleted = await deleteRecipeStep({
        actorUserId: existingUser.id,
        recipeId,
        stepId: second.step.id,
        expectedVersion: 5,
      });
      expect(deleted).toEqual({
        deletedStepId: second.step.id,
        stepIds: [first.step.id],
        version: 6,
      });
      expect(
        await database
          .select({ id: recipeStep.id, position: recipeStep.position })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId)),
      ).toEqual([{ id: first.step.id, position: 0 }]);

      await database.update(recipe).set({ status: "archived" }).where(eq(recipe.id, recipeId));
      await expect(getOwnedRecipeStepEditor(recipeId, existingUser.id)).resolves.toBeNull();
      await expect(
        createRecipeStep({
          actorUserId: existingUser.id,
          recipeId,
          expectedVersion: 6,
          input: { instruction: "Nondraft." },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      const [afterNondraftMutation] = await database
        .select({ version: recipe.version })
        .from(recipe)
        .where(eq(recipe.id, recipeId));
      expect(afterNondraftMutation?.version).toBe(6);
      expect(
        await database
          .select({ id: recipeStep.id })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId)),
      ).toHaveLength(1);
    } finally {
      if (recipeId) {
        await database.delete(recipe).where(eq(recipe.id, recipeId));
      }
    }
  });
});
