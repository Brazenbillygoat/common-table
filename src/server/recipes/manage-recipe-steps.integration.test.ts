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

describe.each(["draft", "published"] as const)("PostgreSQL steps (%s)", (status) => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("persists, reads, versions, reorders, conflicts, deletes, and rolls back", async () => {
    const database = getDatabase();
    const ownerId = `step-owner-${crypto.randomUUID()}`;

    let recipeId: string | undefined;
    try {
      await database.insert(user).values({
        id: ownerId,
        name: "Step test owner",
        email: `${ownerId}@example.invalid`,
      });
      const created = await createRecipeDraft({
        actorUserId: ownerId,
        input: {
          title: `Step integration ${crypto.randomUUID()}`,
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
      const [initial] = await database
        .select({ updatedAt: recipe.updatedAt })
        .from(recipe)
        .where(eq(recipe.id, recipeId));

      const first = await createRecipeStep({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 1,
        input: { instruction: "Mix  gently.\nKeep warm." },
      });
      const second = await createRecipeStep({
        actorUserId: ownerId,
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
      expect(afterCreate?.ownerId).toBe(ownerId);
      expect(afterCreate?.version).toBe(3);
      expect(afterCreate?.updatedAt.getTime()).toBeGreaterThan(initial?.updatedAt.getTime() ?? 0);

      const editor = await getOwnedRecipeStepEditor(recipeId, ownerId);
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
        actorUserId: ownerId,
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
        actorUserId: ownerId,
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
          actorUserId: ownerId,
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
          actorUserId: ownerId,
          recipeId,
          stepId: crypto.randomUUID(),
          expectedVersion: 5,
          input: { instruction: "Missing." },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      const [afterRollback] = await database
        .select({ version: recipe.version })
        .from(recipe)
        .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId)));
      expect(afterRollback?.version).toBe(5);
      expect(
        await database
          .select({ id: recipeStep.id, instruction: recipeStep.instruction })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId)),
      ).toHaveLength(2);

      const deleted = await deleteRecipeStep({
        actorUserId: ownerId,
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
      await expect(getOwnedRecipeStepEditor(recipeId, ownerId)).resolves.toBeNull();
      await expect(
        createRecipeStep({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 6,
          input: { instruction: "Archived." },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      const [afterArchivedMutation] = await database
        .select({ version: recipe.version })
        .from(recipe)
        .where(eq(recipe.id, recipeId));
      expect(afterArchivedMutation?.version).toBe(6);
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
      await database.delete(user).where(eq(user.id, ownerId));
    }
  });
});
