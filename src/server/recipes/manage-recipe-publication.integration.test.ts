// @vitest-environment node
import "dotenv/config";

import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase, getDatabase } from "@/server/db/client";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeIngredientChoiceGroup,
  recipeIngredientSection,
  recipePublication,
  recipeStep,
  unit,
  user,
} from "@/server/db/schema";
import { resolveRecipeAlternatives } from "@/utils/recipe-alternatives";

import { getPublishedRecipe, listPublishedRecipes } from "./get-published-recipes";
import { changeRecipePublication, getOwnedRecipePublication } from "./manage-recipe-publication";
import { updateRecipeDetails } from "./update-recipe-details";
import { updateRecipeIngredientLine } from "./manage-recipe-ingredients";
import { updateRecipeStep } from "./manage-recipe-steps";

const recipeIds: string[] = [];
const ownerIds: string[] = [];
const ingredientIds: string[] = [];
const unitIds: string[] = [];

async function fixture() {
  const db = getDatabase();
  const recipeId = crypto.randomUUID();
  const ownerId = `publication-owner-${recipeId}`;
  ownerIds.push(ownerId);
  await db
    .insert(user)
    .values({ id: ownerId, name: "Publication test author", email: `${ownerId}@example.invalid` });
  recipeIds.push(recipeId);
  const slug = `publication-${recipeId}`;
  await db.insert(recipe).values({
    id: recipeId,
    ownerId,
    title: "Public beans",
    slug,
    description: "Saved description",
  });
  const [section] = await db
    .insert(recipeIngredientSection)
    .values({ recipeId, position: 0, name: "Pot" })
    .returning();
  const [line] = await db
    .insert(recipeIngredient)
    .values({
      recipeId,
      sectionId: section.id,
      position: 0,
      customIngredient: "Beans",
      quantityMin: 2,
      customUnit: "cups",
    })
    .returning();
  const [step] = await db
    .insert(recipeStep)
    .values({ recipeId, position: 0, instruction: "Simmer the beans." })
    .returning();
  const publish = (expectedVersion: number, action: "publish" | "unpublish" = "publish") =>
    changeRecipePublication({ actorUserId: ownerId, recipeId, expectedVersion, action });
  return { db, recipeId, ownerId, slug, section, line, step, publish };
}

afterEach(async () => {
  const db = getDatabase();
  if (recipeIds.length) {
    await db.delete(recipeStep).where(inArray(recipeStep.recipeId, recipeIds));
    await db.delete(recipeIngredient).where(inArray(recipeIngredient.recipeId, recipeIds));
    await db.delete(recipe).where(inArray(recipe.id, recipeIds));
  }
  if (ownerIds.length) await db.delete(user).where(inArray(user.id, ownerIds));
  if (ingredientIds.length)
    await db.delete(ingredient).where(inArray(ingredient.id, ingredientIds));
  if (unitIds.length) await db.delete(unit).where(inArray(unit.id, unitIds));
  recipeIds.length = ownerIds.length = ingredientIds.length = unitIds.length = 0;
});
afterAll(closeDatabase);

describe("publication PostgreSQL integration", () => {
  it("publishes saved values, isolates private edits, replaces atomically and unpublishes at the same URL", async () => {
    const f = await fixture();
    expect(await getPublishedRecipe(f.slug)).toBeNull();
    const first = await f.publish(1);
    expect(first).toMatchObject({ status: "published", version: 2, sourceVersion: 2 });
    const loaded = await getPublishedRecipe(f.slug);
    expect(loaded).toMatchObject({
      recipe: { title: "Public beans" },
      authorDisplayName: "Publication test author",
      ingredients: [{ ingredientName: "Beans" }],
      steps: [{ instruction: "Simmer the beans." }],
    });
    expect(JSON.stringify(loaded)).not.toMatch(
      /ownerId|email|password|session|sourceVersion|version/,
    );
    expect(await getOwnedRecipePublication(f.recipeId, f.ownerId)).toMatchObject({
      version: 2,
      sourceVersion: 2,
    });
    await updateRecipeDetails({
      actorUserId: f.ownerId,
      recipeId: f.recipeId,
      expectedVersion: 2,
      input: {
        title: "Private soup",
        description: "Private notes",
        yieldMin: "4",
        yieldMax: "6",
        yieldUnit: "bowls",
      },
    });
    await updateRecipeIngredientLine({
      actorUserId: f.ownerId,
      recipeId: f.recipeId,
      ingredientId: f.line.id,
      expectedVersion: 3,
      input: {
        ingredientId: null,
        customIngredient: "Lentils",
        quantityMin: 3,
        quantityMax: null,
        quantityText: null,
        unitId: null,
        customUnit: "cups",
        preparationNote: null,
        isOptional: false,
      },
    });
    await updateRecipeStep({
      actorUserId: f.ownerId,
      recipeId: f.recipeId,
      stepId: f.step.id,
      expectedVersion: 4,
      input: { instruction: "Simmer the lentils." },
    });
    expect(await getPublishedRecipe(f.slug)).toEqual(loaded);
    expect((await listPublishedRecipes()).recipes.find((row) => row.slug === f.slug)).toMatchObject(
      { title: "Public beans", description: "Saved description" },
    );
    expect(await getOwnedRecipePublication(f.recipeId, f.ownerId)).toMatchObject({
      version: 5,
      sourceVersion: 2,
    });
    await expect(f.publish(2)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await f.publish(5);
    expect(await getPublishedRecipe(f.slug)).toMatchObject({
      recipe: { title: "Private soup", description: "Private notes", yieldMin: 4, yieldMax: 6 },
      ingredients: [{ ingredientName: "Lentils" }],
      steps: [{ instruction: "Simmer the lentils." }],
    });
    expect(loaded?.recipe.title).toBe("Public beans");
    expect(
      await f.db.select().from(recipePublication).where(eq(recipePublication.recipeId, f.recipeId)),
    ).toHaveLength(1);
    await f.publish(6, "unpublish");
    expect(await getPublishedRecipe(f.slug)).toBeNull();
    expect((await listPublishedRecipes()).recipes.some((row) => row.slug === f.slug)).toBe(false);
    expect(loaded?.steps[0].instruction).toBe("Simmer the beans.");
    expect(await getOwnedRecipePublication(f.recipeId, f.ownerId)).toMatchObject({
      status: "draft",
      version: 7,
      sourceVersion: null,
    });
    await f.publish(7);
    expect(await getPublishedRecipe(f.slug)).toMatchObject({
      recipe: { slug: f.slug, title: "Private soup" },
    });
  });

  it("rejects incomplete, unauthorized, archived and invalid requests without changing the previous snapshot", async () => {
    const f = await fixture();
    await expect(
      changeRecipePublication({
        actorUserId: "different-owner",
        recipeId: f.recipeId,
        expectedVersion: 1,
        action: "publish",
      }),
    ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
    await expect(f.publish(0)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await f.db.delete(recipeStep).where(eq(recipeStep.id, f.step.id));
    await expect(f.publish(1)).rejects.toMatchObject({ code: "INCOMPLETE_RECIPE" });
    expect(await getPublishedRecipe(f.slug)).toBeNull();
    await f.db.insert(recipeStep).values(f.step);
    await f.publish(1);
    const loaded = await getPublishedRecipe(f.slug);
    await f.db.delete(recipeIngredient).where(eq(recipeIngredient.id, f.line.id));
    await expect(f.publish(2)).rejects.toMatchObject({ code: "INCOMPLETE_RECIPE" });
    expect(await getPublishedRecipe(f.slug)).toEqual(loaded);
    await f.db.insert(recipeIngredient).values(f.line);
    await f.db
      .update(recipeStep)
      .set({ conditionKind: "choice_option", conditionIngredientId: f.line.id })
      .where(eq(recipeStep.id, f.step.id));
    await expect(f.publish(2)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await getPublishedRecipe(f.slug)).toEqual(loaded);
    expect(await getOwnedRecipePublication(f.recipeId, f.ownerId)).toMatchObject({ version: 2 });
    await f.db.update(recipe).set({ status: "archived" }).where(eq(recipe.id, f.recipeId));
    await expect(f.publish(2)).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
    await expect(f.publish(2, "unpublish")).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
    expect(await getOwnedRecipePublication(f.recipeId, f.ownerId)).toBeNull();
    expect(await getPublishedRecipe(f.slug)).toBeNull();
  });

  it("allows exactly one competing save or publication and rejects duplicate publication", async () => {
    const f = await fixture();
    const raced = await Promise.allSettled([
      f.publish(1),
      updateRecipeDetails({
        actorUserId: f.ownerId,
        recipeId: f.recipeId,
        expectedVersion: 1,
        input: {
          title: "Competing title",
          description: "",
          yieldMin: "",
          yieldMax: "",
          yieldUnit: "servings",
        },
      }),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "VERSION_CONFLICT" },
    });
    const duplicate = await Promise.allSettled([f.publish(2), f.publish(2)]);
    expect(duplicate.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(duplicate.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "VERSION_CONFLICT" },
    });
    expect(await getOwnedRecipePublication(f.recipeId, f.ownerId)).toMatchObject({
      version: 3,
      sourceVersion: 3,
    });
  });

  it("waits for a parent-locked save before reading and rejects its stale publication version", async () => {
    const f = await fixture();
    await f.publish(1);
    const old = await getPublishedRecipe(f.slug);
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = f.db.transaction(async (tx) => {
      await tx
        .update(recipe)
        .set({ version: 3, title: "Whole new version" })
        .where(eq(recipe.id, f.recipeId));
      locked();
      await proceed;
      await tx
        .update(recipeIngredient)
        .set({ customIngredient: "New ingredient" })
        .where(eq(recipeIngredient.id, f.line.id));
      await tx
        .update(recipeStep)
        .set({ instruction: "New instruction." })
        .where(eq(recipeStep.id, f.step.id));
    });
    await held;
    const waiting = f.publish(2);
    const rejected = expect(waiting).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    release();
    await save;
    await rejected;
    expect(await getPublishedRecipe(f.slug)).toEqual(old);
    await f.publish(3);
    expect(await getPublishedRecipe(f.slug)).toMatchObject({
      recipe: { title: "Whole new version" },
      ingredients: [{ ingredientName: "New ingredient" }],
      steps: [{ instruction: "New instruction." }],
    });
  });

  it("captures resolved reference names and adaptive relationships without depending on later edits", async () => {
    const f = await fixture();
    const referenceId = crypto.randomUUID();
    const unitId = crypto.randomUUID();
    ingredientIds.push(referenceId);
    unitIds.push(unitId);
    await f.db.insert(ingredient).values({
      id: referenceId,
      name: "Fixture olive oil",
      normalizedName: referenceId,
      slug: referenceId,
    });
    await f.db.insert(unit).values({
      id: unitId,
      name: "Fixture spoon",
      pluralName: "Fixture spoons",
      normalizedName: unitId,
      kind: "volume",
    });
    const [group] = await f.db
      .insert(recipeIngredientChoiceGroup)
      .values({ recipeId: f.recipeId, sectionId: f.section.id, label: "Cooking oil" })
      .returning();
    await f.db
      .update(recipeIngredient)
      .set({
        choiceGroupId: group.id,
        customIngredient: null,
        ingredientId: referenceId,
        customUnit: null,
        unitId,
      })
      .where(eq(recipeIngredient.id, f.line.id));
    const [second] = await f.db
      .insert(recipeIngredient)
      .values({
        recipeId: f.recipeId,
        sectionId: f.section.id,
        position: 1,
        choiceGroupId: group.id,
        customIngredient: "Butter",
      })
      .returning();
    const [optional] = await f.db
      .insert(recipeIngredient)
      .values({
        recipeId: f.recipeId,
        sectionId: f.section.id,
        position: 2,
        isOptional: true,
        customIngredient: "Parsley",
      })
      .returning();
    await f.db
      .update(recipeStep)
      .set({ conditionKind: "choice_option", conditionIngredientId: f.line.id })
      .where(eq(recipeStep.id, f.step.id));
    await f.db.insert(recipeStep).values({
      recipeId: f.recipeId,
      position: 1,
      instruction: "Add parsley.",
      conditionKind: "optional_ingredient",
      conditionIngredientId: optional.id,
    });
    await f.publish(1);
    const loaded = await getPublishedRecipe(f.slug);
    if (!loaded) throw new Error("Fixture publication unavailable.");
    expect(loaded.ingredients[0]).toMatchObject({
      ingredientName: "Fixture olive oil",
      unitName: "Fixture spoon",
    });
    expect(loaded.steps[0].conditionLabel).toBe("Cooking oil: Fixture olive oil");
    expect(
      resolveRecipeAlternatives(loaded, {
        choiceOptionIds: [second.id],
        optionalIngredientIds: [optional.id],
      }).steps.map((step) => [step.state, step.activeNumber]),
    ).toEqual([
      ["inactive", null],
      ["active", 1],
    ]);
    await f.db
      .update(ingredient)
      .set({ name: "Changed canonical label" })
      .where(eq(ingredient.id, referenceId));
    await f.db.update(unit).set({ name: "Changed unit label" }).where(eq(unit.id, unitId));
    expect(await getPublishedRecipe(f.slug)).toEqual(loaded);
  });

  it("fails closed for missing, unsupported, malformed and mismatched snapshots", async () => {
    const f = await fixture();
    await f.publish(1);
    const [stored] = await f.db
      .select()
      .from(recipePublication)
      .where(eq(recipePublication.recipeId, f.recipeId));
    await f.db
      .update(recipePublication)
      .set({ formatVersion: 999 })
      .where(eq(recipePublication.recipeId, f.recipeId));
    expect(await getPublishedRecipe(f.slug)).toBeNull();
    await f.db
      .update(recipePublication)
      .set({
        formatVersion: 1,
        snapshot: {
          ...stored.snapshot,
          recipe: { ...stored.snapshot.recipe, id: crypto.randomUUID() },
        },
      })
      .where(eq(recipePublication.recipeId, f.recipeId));
    expect(await getPublishedRecipe(f.slug)).toBeNull();
    await f.db
      .update(recipePublication)
      .set({ snapshot: { ...stored.snapshot, steps: [] } })
      .where(eq(recipePublication.recipeId, f.recipeId));
    expect(await getPublishedRecipe(f.slug)).toBeNull();
    expect((await listPublishedRecipes()).recipes.some((row) => row.slug === f.slug)).toBe(false);
    await f.db.delete(recipePublication).where(eq(recipePublication.recipeId, f.recipeId));
    expect(await getPublishedRecipe(f.slug)).toBeNull();
  });

  it("pages twenty valid publications using timestamp then recipe identity", async () => {
    const f = await fixture();
    await f.publish(1);
    const content = await getPublishedRecipe(f.slug);
    if (!content) throw new Error("Fixture publication unavailable.");
    const ids = Array.from({ length: 21 }, () => crypto.randomUUID()).sort();
    const timestamp = new Date("2199-01-01T00:00:00Z");
    recipeIds.push(...ids);
    await f.db.insert(recipe).values(
      ids.map((id) => ({
        id,
        ownerId: f.ownerId,
        title: "Private paging title",
        slug: `paging-${id}`,
        status: "published" as const,
        publishedAt: timestamp,
      })),
    );
    await f.db.insert(recipePublication).values(
      ids.map((id) => ({
        recipeId: id,
        formatVersion: 1,
        sourceVersion: 1,
        publishedAt: timestamp,
        snapshot: { ...content, recipe: { ...content.recipe, id, slug: `paging-${id}` } },
      })),
    );
    const first = await listPublishedRecipes(1);
    expect(first.recipes.map((row) => row.slug)).toEqual(
      ids.slice(0, 20).map((id) => `paging-${id}`),
    );
    expect(first.hasNextPage).toBe(true);
    expect((await listPublishedRecipes(2)).recipes[0].slug).toBe(`paging-${ids[20]}`);
    expect(first.recipes.every((row) => row.title === "Public beans")).toBe(true);
  });
});
