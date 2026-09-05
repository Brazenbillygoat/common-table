import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { RecipeCookingContent } from "@/components/recipes/RecipeCookingContent";
import { getPublishedRecipe } from "@/server/recipes/get-published-recipes";

import styles from "./recipe.module.scss";

type PublicRecipePageProps = { params: Promise<{ slug: string }> };

// React cache shares this read across metadata and the body only for this request.
// Each new visit or refresh reads the latest published snapshot from the server.
const readPublication = cache(async (slug: string) => {
  await connection();
  const publication = await getPublishedRecipe(slug);
  if (!publication) notFound();
  return publication;
});

export async function generateMetadata({ params }: PublicRecipePageProps): Promise<Metadata> {
  const { slug } = await params;
  const { recipe } = await readPublication(slug);
  return { title: recipe.title, description: recipe.description ?? undefined };
}

export default async function PublicRecipePage({ params }: PublicRecipePageProps) {
  const { slug } = await params;
  const publication = await readPublication(slug);
  const { recipe } = publication;

  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <Link className={styles.browseLink} href="/" prefetch={false}>
        Browse recipes
      </Link>
      <header className={styles.header}>
        <h1>{recipe.title}</h1>
        <p className={styles.author}>By {publication.authorDisplayName}</p>
        {recipe.description ? <p className={styles.description}>{recipe.description}</p> : null}
        {recipe.yieldMin !== null ? (
          <p className={styles.yield}>
            Yield: {recipe.yieldMin}
            {recipe.yieldMax !== null ? `–${recipe.yieldMax}` : ""} {recipe.yieldUnit}
          </p>
        ) : null}
      </header>
      <RecipeCookingContent content={publication} />
    </main>
  );
}
