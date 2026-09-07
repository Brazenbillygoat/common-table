import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDatabase } from "../src/server/db/client";
import { account, recipe, recipePublication, user } from "../src/server/db/schema";
import { searchSnapshot } from "../src/utils/recipe-search.test-fixtures";

export async function createFixture() {
  const db = getDatabase();
  const ownerId = `offline-e2e-${crypto.randomUUID()}`;
  const email = `${ownerId}@example.invalid`;
  const password = "test-only-offline-password";
  const ids = Array.from({ length: 22 }, () => crypto.randomUUID());
  const draftId = crypto.randomUUID();
  await db.insert(user).values({ id: ownerId, name: "Private fixture identity", email });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: ownerId,
    accountId: ownerId,
    providerId: "credential",
    password: await hashPassword(password),
  });
  await db.insert(recipe).values([
    ...ids.map((id, index) => ({
      id,
      ownerId,
      slug: `offline-${id}`,
      title: `Private title ${index}`,
      status: "published" as const,
      publishedAt: new Date(),
    })),
    {
      id: draftId,
      ownerId,
      slug: `draft-${draftId}`,
      title: "Private unsaved draft",
      status: "draft" as const,
      publishedAt: null,
    },
  ]);
  const snapshots = ids.map((id, index) => {
    const snapshot = searchSnapshot();
    snapshot.recipe = {
      ...snapshot.recipe,
      id,
      slug: `offline-${id}`,
      title: `Offline stew ${String(index).padStart(2, "0")}`,
    };
    return snapshot;
  });
  await db.insert(recipePublication).values(
    snapshots.map((snapshot) => ({
      recipeId: snapshot.recipe.id,
      snapshot,
      formatVersion: 1,
      sourceVersion: 1,
      publishedAt: new Date("2026-09-06T12:00:00Z"),
    })),
  );
  return {
    ids,
    snapshots,
    draftId,
    email,
    password,
    async update(index = 0) {
      snapshots[index].recipe.title = "Updated public stew";
      await db
        .update(recipePublication)
        .set({ snapshot: snapshots[index], publishedAt: new Date() })
        .where(eq(recipePublication.recipeId, ids[index]));
    },
    async unpublish(index = 1) {
      await db.transaction(async (tx) => {
        await tx.delete(recipePublication).where(eq(recipePublication.recipeId, ids[index]));
        await tx
          .update(recipe)
          .set({ status: "draft", publishedAt: null })
          .where(eq(recipe.id, ids[index]));
      });
    },
    async cleanup() {
      await db.delete(recipe).where(inArray(recipe.id, [...ids, draftId]));
      await db.delete(user).where(eq(user.id, ownerId));
    },
  };
}
