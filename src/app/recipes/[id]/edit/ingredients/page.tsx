import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { getOwnedRecipeIngredientEditor } from "@/server/recipes/get-owned-recipe-ingredient-editor";

import { RecipeEditNavigation } from "../RecipeEditNavigation";
import { IngredientEditor } from "./IngredientEditor";
import styles from "./ingredient-stage.module.scss";

export const metadata: Metadata = {
  title: "Recipe Ingredients",
};

export default async function IngredientStagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  // This is a Server Component, so it can load the editor without shipping database code to the browser.
  const editor = await getOwnedRecipeIngredientEditor(id, session.user.id);
  if (!editor) {
    // Missing and unauthorized drafts intentionally share the same response.
    notFound();
  }

  // The version key remounts the editor after router.refresh() so stale client state is thrown away.
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <header>
        <p className={styles.eyebrow}>Recipe draft</p>
        <p className={styles.recipeTitle}>{editor.recipe.title}</p>
        <h1>Ingredients</h1>
      </header>
      <RecipeEditNavigation currentStage="ingredients" recipeId={editor.recipe.id} />
      <IngredientEditor data={editor} key={editor.recipe.version} />
    </main>
  );
}
