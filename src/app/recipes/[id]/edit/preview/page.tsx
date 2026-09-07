import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth/session";
import { getOwnedRecipePreview } from "@/server/recipes/get-owned-recipe-preview";
import { getOwnedRecipePublication } from "@/server/recipes/manage-recipe-publication";
import { publicationReadiness } from "@/utils/recipe-publication";

import { RecipeEditNavigation } from "../RecipeEditNavigation";
import { RecipePreview } from "./RecipePreview";
import { PublicationControls } from "./PublicationControls";
import styles from "./recipe-preview.module.scss";

export const metadata: Metadata = { title: "Preview Recipe" };

export default async function RecipePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const preview = await getOwnedRecipePreview(id, session.user.id);
  if (!preview) notFound();
  const publication = await getOwnedRecipePublication(id, session.user.id);
  if (!publication) notFound();
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <header>
        <p className={styles.eyebrow}>Saved recipe preview</p>
        <h1>{preview.recipe.title}</h1>
        {preview.recipe.description ? (
          <p className={styles.description}>{preview.recipe.description}</p>
        ) : null}
        {preview.recipe.yieldMin !== null ? (
          <p className={styles.yield}>
            Yield: {preview.recipe.yieldMin}
            {preview.recipe.yieldMax !== null ? `–${preview.recipe.yieldMax}` : ""}{" "}
            {preview.recipe.yieldUnit}
          </p>
        ) : null}
        <p>Try ingredient choices without changing the authored recipe.</p>
      </header>
      <RecipeEditNavigation currentStage="preview" recipeId={preview.recipe.id} />
      <PublicationControls
        key={`${preview.recipe.version}:${publication.version}`}
        recipeId={id}
        publication={{
          ...publication,
          publishedAt: publication.publishedAt?.toISOString() ?? null,
        }}
        requirements={publicationReadiness(preview)}
        stale={publication.version !== preview.recipe.version}
      />
      <RecipePreview content={preview} />
    </main>
  );
}
