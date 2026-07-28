import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/server/db/client";
import { recipe } from "@/server/db/schema";

export async function listOwnedRecipeDrafts(ownerId: string) {
  return getDatabase()
    .select({
      id: recipe.id,
      title: recipe.title,
      version: recipe.version,
      updatedAt: recipe.updatedAt,
    })
    .from(recipe)
    .where(and(eq(recipe.ownerId, ownerId), eq(recipe.status, "draft")))
    .orderBy(desc(recipe.updatedAt), asc(recipe.title));
}
