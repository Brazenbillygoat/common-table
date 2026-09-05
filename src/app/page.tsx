import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { listPublishedRecipes } from "@/server/recipes/get-published-recipes";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Browse Recipes" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  await connection();
  const query = await searchParams;
  const requestedPage =
    typeof query.page === "string" && /^[1-9]\d*$/.test(query.page) ? Number(query.page) : 1;
  const page = Number.isSafeInteger(requestedPage) ? requestedPage : 1;
  const result = await listPublishedRecipes(page);

  return (
    <main className="page-shell" id="main-content">
      <h1>Browse recipes</h1>
      <p>Find something to cook, shared from our kitchens.</p>
      {result.recipes.length > 0 ? (
        <ul className={styles.recipeList}>
          {result.recipes.map((recipe) => (
            <li className={styles.recipeCard} key={recipe.slug}>
              <article>
                <h2>
                  <Link href={`/r/${recipe.slug}`} prefetch={false}>
                    {recipe.title}
                  </Link>
                </h2>
                {recipe.description ? (
                  <p className={styles.description}>{recipe.description}</p>
                ) : null}
                <p className={styles.author}>By {recipe.authorDisplayName}</p>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {result.page === 1 ? "No recipes have been published yet." : "No recipes on this page."}
        </p>
      )}
      {result.page > 1 || result.hasNextPage ? (
        <nav aria-label="Recipe pages" className={styles.pagination}>
          {result.page > 1 ? (
            <Link href={result.page === 2 ? "/" : `/?page=${result.page - 1}`} prefetch={false}>
              Previous page
            </Link>
          ) : null}
          <span aria-current="page">Page {result.page}</span>
          {result.hasNextPage ? (
            <Link href={`/?page=${result.page + 1}`} prefetch={false}>
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
