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
  recipeIngredientSection,
  recipePublication,
  recipeStep,
  user,
} from "@/server/db/schema";
import { searchSnapshot } from "@/utils/recipe-search.test-fixtures";
import { changeRecipePublication } from "./manage-recipe-publication";
import { searchPublishedRecipes } from "./search-published-recipes";
import { updateRecipeDetails } from "./update-recipe-details";
import { updateRecipeIngredientLine } from "./manage-recipe-ingredients";

const recipeIds: string[] = [];
const ownerIds: string[] = [];
const ingredientIds: string[] = [];
const uniqueTerm = () => `search${crypto.randomUUID().replaceAll("-", "")}`;

async function owner() {
  const id = `search-owner-${crypto.randomUUID()}`;
  ownerIds.push(id);
  await getDatabase()
    .insert(user)
    .values({ id, name: "Search fixture cook", email: `${id}@example.invalid` });
  return id;
}

async function results(parameters: Parameters<typeof searchPublishedRecipes>[0]) {
  const result = await searchPublishedRecipes(parameters);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result;
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
  recipeIds.length = ownerIds.length = ingredientIds.length = 0;
});
afterAll(closeDatabase);

describe("published recipe search PostgreSQL integration", () => {
  it("searches captured canonical/custom names, isolates private edits and reflects publication changes", async () => {
    const db = getDatabase();
    const ownerId = await owner();
    const id = crypto.randomUUID();
    recipeIds.push(id);
    const publicTerm = uniqueTerm();
    const privateTerm = uniqueTerm();
    const canonicalTerm = uniqueTerm();
    const renamedTerm = uniqueTerm();
    const ingredientId = crypto.randomUUID();
    ingredientIds.push(ingredientId);
    await db.insert(ingredient).values({
      id: ingredientId,
      name: `${canonicalTerm} Salted butter`,
      normalizedName: canonicalTerm,
      slug: canonicalTerm,
    });
    await db.insert(recipe).values({ id, ownerId, slug: `search-${id}`, title: publicTerm });
    const [section] = await db
      .insert(recipeIngredientSection)
      .values({ recipeId: id, position: 0 })
      .returning();
    const [line] = await db
      .insert(recipeIngredient)
      .values({ recipeId: id, sectionId: section.id, position: 0, ingredientId })
      .returning();
    await db.insert(recipeStep).values({ recipeId: id, position: 0, instruction: "Mix." });
    const publish = (expectedVersion: number, action: "publish" | "unpublish" = "publish") =>
      changeRecipePublication({ recipeId: id, actorUserId: ownerId, expectedVersion, action });
    expect((await results({ q: publicTerm })).total).toBe(0);
    await publish(1);
    expect((await results({ q: publicTerm, include: "BUTTER" })).total).toBe(1);
    expect((await results({ q: canonicalTerm })).total).toBe(1);
    expect((await results({ q: publicTerm, exclude: "butter" })).total).toBe(0);
    await db.update(ingredient).set({ name: renamedTerm }).where(eq(ingredient.id, ingredientId));
    await updateRecipeDetails({
      actorUserId: ownerId,
      recipeId: id,
      expectedVersion: 2,
      input: {
        title: privateTerm,
        description: "",
        yieldMin: "",
        yieldMax: "",
        yieldUnit: "servings",
      },
    });
    await updateRecipeIngredientLine({
      actorUserId: ownerId,
      recipeId: id,
      ingredientId: line.id,
      expectedVersion: 3,
      input: {
        ingredientId: null,
        customIngredient: `${privateTerm} Peanut butter`,
        quantityMin: null,
        quantityMax: null,
        quantityText: null,
        unitId: null,
        customUnit: null,
        preparationNote: null,
        isOptional: false,
      },
    });
    expect((await results({ q: publicTerm, include: canonicalTerm })).total).toBe(1);
    expect((await results({ q: privateTerm })).total).toBe(0);
    expect((await results({ q: renamedTerm })).total).toBe(0);
    await publish(4);
    expect((await results({ q: publicTerm })).total).toBe(0);
    expect((await results({ q: privateTerm, include: "butter" })).total).toBe(1);
    await publish(5, "unpublish");
    expect((await results({ q: privateTerm })).total).toBe(0);
    await publish(6);
    expect((await results({ q: privateTerm })).recipes[0].slug).toBe(`search-${id}`);
  });

  it("filters valid published snapshots before stable pagination, excluding broken identities and draft rows", async () => {
    const db = getDatabase();
    const ownerId = await owner();
    const marker = uniqueTerm();
    const ids = Array.from({ length: 27 }, () => crypto.randomUUID()).sort();
    recipeIds.push(...ids);
    const timestamp = new Date("2198-01-01T00:00:00Z");
    await db.insert(recipe).values(
      ids.map((id, index) => ({
        id,
        ownerId,
        slug: `search-${id}`,
        title: "Private paging title",
        status: index === 26 ? ("draft" as const) : ("published" as const),
        publishedAt: index === 26 ? null : timestamp,
      })),
    );
    await db.insert(recipePublication).values(
      ids.map((id, index) => {
        const snapshot = searchSnapshot();
        snapshot.recipe = { ...snapshot.recipe, id, slug: `search-${id}`, title: marker };
        if (index === 21) snapshot.steps = [];
        if (index === 22) snapshot.recipe.id = crypto.randomUUID();
        if (index === 23) snapshot.recipe.slug = "wrong-slug";
        if (index === 25) snapshot.ingredients[5].ingredientName = "Required butter";
        return {
          recipeId: id,
          sourceVersion: 1,
          formatVersion: index === 24 ? 999 : 1,
          publishedAt: timestamp,
          snapshot,
        };
      }),
    );
    const parameters = { q: marker, include: ["chicken", "tofu"], exclude: "butter" };
    const first = await results(parameters);
    expect(first.total).toBe(21);
    expect(first.recipes.map((item) => item.slug)).toEqual(
      ids.slice(0, 20).map((id) => `search-${id}`),
    );
    expect(first.hasNextPage).toBe(true);
    expect(first.recipes[0].explanations).toEqual([
      "Omit optional Peanut butter.",
      "Cooking fat: use Olive oil to avoid Salted butter.",
    ]);
    const second = await results({ ...parameters, page: "2" });
    expect(second.recipes.map((item) => item.slug)).toEqual([`search-${ids[20]}`]);
    expect(second.hasNextPage).toBe(false);
    expect((await results({ ...parameters, exclude: "butter,oil" })).total).toBe(0);
    expect((await results({ q: marker, include: "chicken", exclude: "chicken" })).total).toBe(0);
  });
});
