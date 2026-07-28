import type { Metadata } from "next";

import { requireUser } from "@/server/auth/session";

import { StartRecipeForm } from "./StartRecipeForm";
import styles from "./start-recipe.module.scss";

export const metadata: Metadata = {
  title: "Start a Recipe",
};

export default async function NewRecipePage() {
  await requireUser();

  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Create recipe</p>
        <h1>Start a recipe</h1>
        <p>Add the basics now. You’ll add ingredients next.</p>
      </header>
      <StartRecipeForm />
    </main>
  );
}
