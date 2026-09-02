import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { getOwnedRecipePreview } from "@/server/recipes/get-owned-recipe-preview";

import { RecipeEditNavigation } from "../RecipeEditNavigation";
import { RecipePreview } from "./RecipePreview";
import styles from "./recipe-preview.module.scss";

export const metadata: Metadata = { title: "Preview Recipe Draft" };

export default async function RecipePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const preview = await getOwnedRecipePreview(id, session.user.id);
  if (!preview) notFound();
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <header>
        <p className={styles.eyebrow}>Owner draft preview</p>
        <h1>{preview.recipe.title}</h1>
        <p>Try ingredient choices without changing the authored recipe.</p>
      </header>
      <RecipeEditNavigation currentStage="preview" recipeId={preview.recipe.id} />
      <RecipePreview content={preview} />
    </main>
  );
}
