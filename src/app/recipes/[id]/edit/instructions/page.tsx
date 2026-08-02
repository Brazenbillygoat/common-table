import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { getOwnedRecipeStepEditor } from "@/server/recipes/get-owned-recipe-step-editor";

import { RecipeEditNavigation } from "../RecipeEditNavigation";
import { InstructionEditor } from "./InstructionEditor";
import styles from "./instruction-stage.module.scss";

export const metadata: Metadata = {
  title: "Recipe Instructions",
};

export default async function InstructionStagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }
  const editor = await getOwnedRecipeStepEditor(id, session.user.id);
  if (!editor) {
    notFound();
  }
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <header>
        <p className={styles.eyebrow}>Recipe draft</p>
        <p className={styles.recipeTitle}>{editor.recipe.title}</p>
        <h1>Instructions</h1>
      </header>
      <RecipeEditNavigation currentStage="instructions" recipeId={editor.recipe.id} />
      <InstructionEditor data={editor} key={editor.recipe.version} />
    </main>
  );
}
