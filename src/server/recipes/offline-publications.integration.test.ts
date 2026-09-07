// @vitest-environment node
import "dotenv/config";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDatabase, closeDatabase } from "@/server/db/client";
import { recipe, recipePublication, user } from "@/server/db/schema";
import { searchSnapshot } from "@/utils/recipe-search.test-fixtures";
import { downloadOfflinePublications, readOfflinePublications } from "./offline-publications";

const actorId = `offline-fixture-${crypto.randomUUID()}`;
afterAll(async () => {
  await getDatabase().delete(recipe).where(eq(recipe.ownerId, actorId));
  await getDatabase().delete(user).where(eq(user.id, actorId));
  await closeDatabase();
});
describe("offline PostgreSQL publication snapshots", () => {
  it("isolates drafts, captures consistent revisions, sends only deltas and removes unpublications", async () => {
    const db = getDatabase();
    await db
      .insert(user)
      .values({ id: actorId, name: "Offline fixture", email: `${actorId}@example.invalid` });
    const id = crypto.randomUUID();
    const slug = `offline-${id}`;
    await db.insert(recipe).values({ id, slug, ownerId: actorId, title: "Private draft title" });
    const initial = await readOfflinePublications();
    expect(initial.recipes.some((item) => item.snapshot.recipe.id === id)).toBe(false);
    const snapshot = searchSnapshot();
    snapshot.recipe = { ...snapshot.recipe, id, slug };
    await db.transaction(async (tx) => {
      await tx
        .update(recipe)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(recipe.id, id));
      await tx.insert(recipePublication).values({
        recipeId: id,
        snapshot,
        formatVersion: 1,
        sourceVersion: 1,
        publishedAt: new Date(),
      });
    });
    const first = await readOfflinePublications();
    const item = first.recipes.find((item) => item.snapshot.recipe.id === id)!;
    expect(item.snapshot.recipe.title).toBe("Family stew");
    expect(JSON.stringify(item)).not.toContain("Private draft title");
    const known = first.manifest.entries;
    expect(
      (await downloadOfflinePublications(first.manifest.revision, known))?.recipes,
    ).toHaveLength(0);
    snapshot.recipe.title = "Public update";
    await db.update(recipePublication).set({ snapshot }).where(eq(recipePublication.recipeId, id));
    expect(await downloadOfflinePublications(first.manifest.revision, known)).toBeNull();
    const second = await readOfflinePublications();
    expect(
      (await downloadOfflinePublications(second.manifest.revision, known))?.recipes.map(
        (item) => item.snapshot.recipe.id,
      ),
    ).toEqual([id]);
    await db.update(recipe).set({ status: "draft", publishedAt: null }).where(eq(recipe.id, id));
    const removed = await readOfflinePublications();
    expect(removed.manifest.entries.some((item) => item.id === id)).toBe(false);
    // Missing or incompatible publications fail, not silently shrink the copy.
    await db
      .update(recipe)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(recipe.id, id));
    await db
      .update(recipePublication)
      .set({ formatVersion: 999 })
      .where(eq(recipePublication.recipeId, id));
    await expect(readOfflinePublications()).rejects.toThrow("newer app");
    await db.delete(recipePublication).where(eq(recipePublication.recipeId, id));
    await expect(readOfflinePublications()).rejects.toThrow("incomplete");
  });
});
