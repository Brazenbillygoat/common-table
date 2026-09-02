import Link from "next/link";

import styles from "./recipe-edit-navigation.module.scss";

export function RecipeEditNavigation({
  recipeId,
  currentStage,
}: {
  recipeId: string;
  currentStage: "ingredients" | "instructions" | "preview";
}) {
  return (
    <nav aria-label="Recipe editing" className={styles.navigation}>
      <Link
        aria-current={currentStage === "ingredients" ? "page" : undefined}
        href={`/recipes/${recipeId}/edit/ingredients`}
      >
        Ingredients
      </Link>
      <Link
        aria-current={currentStage === "instructions" ? "page" : undefined}
        href={`/recipes/${recipeId}/edit/instructions`}
      >
        Instructions
      </Link>
      <Link
        aria-current={currentStage === "preview" ? "page" : undefined}
        href={`/recipes/${recipeId}/edit/preview`}
      >
        Preview
      </Link>
      <Link href="/recipes">My recipes</Link>
    </nav>
  );
}
