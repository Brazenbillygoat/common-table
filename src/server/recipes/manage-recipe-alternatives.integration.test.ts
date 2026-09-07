// @vitest-environment node

import "dotenv/config";

import { and, asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientChoiceGroup,
  recipeIngredientSection,
  recipeStep,
  user,
} from "@/server/db/schema";
import type { RecipeIngredientInput } from "@/utils/recipe-ingredient";

import { createRecipeDraft } from "./create-recipe-draft";
import { getOwnedRecipeIngredientEditor } from "./get-owned-recipe-ingredient-editor";
import { mutateRecipeIngredientStructure } from "./manage-recipe-ingredient-structure";
import {
  createRecipeIngredientLine,
  deleteRecipeIngredientLine,
  updateRecipeIngredientLine,
} from "./manage-recipe-ingredients";
import { createRecipeStep, deleteRecipeStep, updateRecipeStep } from "./manage-recipe-steps";

describe.each(["draft", "published"] as const)("PostgreSQL alternatives (%s)", (status) => {
  afterAll(async () => closeDatabase());

  it("preserves ownership, versions, grouping, conditions, guards, ordering, moves, and rollback", async () => {
    const database = getDatabase();
    const ownerId = `alternatives-owner-${crypto.randomUUID()}`;
    const [canonicalIngredient] = await database
      .select({ id: ingredient.id })
      .from(ingredient)
      .where(eq(ingredient.isActive, true))
      .limit(1);
    if (!canonicalIngredient) {
      throw new Error("Integration test requires one active ingredient.");
    }

    let recipeId: string | undefined;
    try {
      await database.insert(user).values({
        id: ownerId,
        name: "Alternatives test owner",
        email: `${ownerId}@example.invalid`,
      });
      const created = await createRecipeDraft({
        actorUserId: ownerId,
        input: {
          title: `Alternative integration ${crypto.randomUUID()}`,
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
      const [initialSection] = await database
        .select({ id: recipeIngredientSection.id })
        .from(recipeIngredientSection)
        .where(eq(recipeIngredientSection.recipeId, recipeId));
      if (!initialSection) throw new Error("Draft did not create its initial section.");

      await expect(
        mutateRecipeIngredientStructure({
          actorUserId: "another-user",
          recipeId,
          expectedVersion: 1,
          action: { type: "renameSection", sectionId: initialSection.id, name: "Unauthorized" },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      await expect(
        mutateRecipeIngredientStructure({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 2,
          action: { type: "renameSection", sectionId: initialSection.id, name: "Stale" },
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      await expect(
        mutateRecipeIngredientStructure({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 1,
          action: { type: "addSection", name: "Seasoning" },
        }),
      ).rejects.toMatchObject({ code: "UNNAMED_SECTION_REQUIRES_NAME" });
      await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 1,
        action: { type: "renameSection", sectionId: initialSection.id, name: "Filling" },
      });
      await expect(
        mutateRecipeIngredientStructure({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 2,
          action: { type: "addSection", name: " filling " },
        }),
      ).rejects.toMatchObject({ code: "DUPLICATE_SECTION" });
      const addedSection = await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 2,
        action: { type: "addSection", name: "Seasoning" },
      });
      if (!("sectionId" in addedSection)) throw new Error("Section insert returned no id.");
      const seasoningId = addedSection.sectionId;

      const tofu = await createRecipeIngredientLine({
        actorUserId: ownerId,
        recipeId,
        sectionId: initialSection.id,
        expectedVersion: 3,
        input: normalized(canonicalIngredient.id, false),
      });
      const greenOnions = await createRecipeIngredientLine({
        actorUserId: ownerId,
        recipeId,
        sectionId: seasoningId,
        expectedVersion: 4,
        input: {
          ...normalized(null, true),
          customIngredient: "Green onions",
        },
      });
      const grouped = await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 5,
        action: {
          type: "createGroup",
          ingredientId: tofu.line.id,
          label: "Protein",
          option: raw("Pork"),
        },
      });
      if (!("groupId" in grouped)) throw new Error("Group insert returned no id.");

      const choiceStep = await createRecipeStep({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 6,
        input: {
          instruction: "Cook the tofu.",
          conditionKind: "choice_option",
          conditionIngredientId: tofu.line.id,
        },
      });
      const optionalStep = await createRecipeStep({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 7,
        input: {
          instruction: "Add green onions.",
          conditionKind: "optional_ingredient",
          conditionIngredientId: greenOnions.line.id,
        },
      });

      const preservedCondition = await updateRecipeStep({
        actorUserId: ownerId,
        recipeId,
        stepId: choiceStep.step.id,
        expectedVersion: 8,
        input: { instruction: "Cook the selected protein." },
      });
      expect(preservedCondition.step).toMatchObject({
        conditionKind: "choice_option",
        conditionIngredientId: tofu.line.id,
      });
      await expect(
        createRecipeStep({
          actorUserId: "another-user",
          recipeId,
          expectedVersion: 9,
          input: {
            instruction: "Probe another owner's choice.",
            conditionKind: "choice_option",
            conditionIngredientId: tofu.line.id,
          },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      await expect(
        createRecipeStep({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 9,
          input: {
            instruction: "Use the wrong condition kind.",
            conditionKind: "optional_ingredient",
            conditionIngredientId: tofu.line.id,
          },
        }),
      ).rejects.toMatchObject({ code: "CONDITION_INVALID" });
      await expect(
        updateRecipeIngredientLine({
          actorUserId: ownerId,
          recipeId,
          ingredientId: greenOnions.line.id,
          expectedVersion: 9,
          input: {
            ...normalized(null, false),
            customIngredient: "Green onions",
          },
        }),
      ).rejects.toMatchObject({ code: "CONTENT_REFERENCED" });

      await expect(
        mutateRecipeIngredientStructure({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 9,
          action: { type: "ungroup", groupId: grouped.groupId },
        }),
      ).rejects.toMatchObject({ code: "CONTENT_REFERENCED" });
      await expect(
        deleteRecipeIngredientLine({
          actorUserId: ownerId,
          recipeId,
          ingredientId: greenOnions.line.id,
          expectedVersion: 9,
        }),
      ).rejects.toMatchObject({ code: "CONTENT_REFERENCED" });
      expect(
        await database
          .select({ version: recipe.version })
          .from(recipe)
          .where(eq(recipe.id, recipeId)),
      ).toEqual([{ version: 9 }]);

      const addedOption = await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 9,
        action: { type: "addGroupOption", groupId: grouped.groupId, option: raw("Tempeh") },
      });
      if (!("optionId" in addedOption)) throw new Error("Option insert returned no id.");
      const currentOptions = await database
        .select({ id: recipeIngredient.id })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.choiceGroupId, grouped.groupId))
        .orderBy(asc(recipeIngredient.position));
      const reorderedIds = [
        addedOption.optionId,
        ...currentOptions.map((option) => option.id).filter((id) => id !== addedOption.optionId),
      ];
      await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 10,
        action: {
          type: "reorderGroupOptions",
          groupId: grouped.groupId,
          optionIds: reorderedIds,
        },
      });
      await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 11,
        action: {
          type: "moveItem",
          itemType: "group",
          itemId: grouped.groupId,
          targetSectionId: seasoningId,
          targetIndex: 0,
        },
      });

      const editor = await getOwnedRecipeIngredientEditor(recipeId, ownerId);
      expect(editor?.sections?.map((section) => section.name)).toEqual(["Filling", "Seasoning"]);
      expect(editor?.choiceGroups).toEqual([
        { id: grouped.groupId, sectionId: seasoningId, label: "Protein" },
      ]);
      const seasoningLines = editor?.lines.filter((line) => line.sectionId === seasoningId) ?? [];
      expect(seasoningLines.slice(0, 3).map((line) => line.id)).toEqual(reorderedIds);
      expect(
        seasoningLines.slice(0, 3).every((line) => line.choiceGroupId === grouped.groupId),
      ).toBe(true);
      expect(seasoningLines.map((line) => line.position)).toEqual([0, 1, 2, 3]);

      await expect(
        database
          .update(recipeIngredient)
          .set({ sectionId: initialSection.id })
          .where(eq(recipeIngredient.id, reorderedIds[0])),
      ).rejects.toThrow();

      await deleteRecipeStep({
        actorUserId: ownerId,
        recipeId,
        stepId: choiceStep.step.id,
        expectedVersion: 12,
      });
      await deleteRecipeStep({
        actorUserId: ownerId,
        recipeId,
        stepId: optionalStep.step.id,
        expectedVersion: 13,
      });
      await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 14,
        action: { type: "ungroup", groupId: grouped.groupId },
      });
      await mutateRecipeIngredientStructure({
        actorUserId: ownerId,
        recipeId,
        expectedVersion: 15,
        action: {
          type: "deleteSection",
          sectionId: initialSection.id,
          disposition: "delete",
        },
      });

      expect(
        await database
          .select({ id: recipeIngredientChoiceGroup.id })
          .from(recipeIngredientChoiceGroup)
          .where(eq(recipeIngredientChoiceGroup.recipeId, recipeId)),
      ).toEqual([]);
      expect(
        await database
          .select({ id: recipeStep.id })
          .from(recipeStep)
          .where(eq(recipeStep.recipeId, recipeId)),
      ).toEqual([]);
      expect(
        await database
          .select({ version: recipe.version })
          .from(recipe)
          .where(and(eq(recipe.id, recipeId), eq(recipe.ownerId, ownerId))),
      ).toEqual([{ version: 16 }]);

      await database.update(recipe).set({ status: "archived" }).where(eq(recipe.id, recipeId));
      await expect(
        mutateRecipeIngredientStructure({
          actorUserId: ownerId,
          recipeId,
          expectedVersion: 16,
          action: { type: "renameSection", sectionId: seasoningId, name: "Archived change" },
        }),
      ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
      expect(
        await database
          .select({ version: recipe.version })
          .from(recipe)
          .where(eq(recipe.id, recipeId)),
      ).toEqual([{ version: 16 }]);
      expect(
        await database
          .select({ name: recipeIngredientSection.name })
          .from(recipeIngredientSection)
          .where(eq(recipeIngredientSection.id, seasoningId)),
      ).toEqual([{ name: "Seasoning" }]);
    } finally {
      if (recipeId) await database.delete(recipe).where(eq(recipe.id, recipeId));
      await database.delete(user).where(eq(user.id, ownerId));
    }
  });
});

function normalized(ingredientId: string | null, isOptional: boolean) {
  return {
    ingredientId,
    customIngredient: ingredientId ? null : "Custom ingredient",
    quantityMin: null,
    quantityMax: null,
    quantityText: null,
    unitId: null,
    customUnit: null,
    preparationNote: null,
    isOptional,
  };
}

function raw(customIngredient: string): RecipeIngredientInput {
  return {
    ingredientSource: "custom",
    ingredientId: "",
    customIngredient,
    quantityMode: "none",
    quantityMin: "",
    quantityMax: "",
    quantityText: "",
    unitSource: "none",
    unitId: "",
    customUnit: "",
    preparationNote: "",
    isOptional: false,
  };
}
