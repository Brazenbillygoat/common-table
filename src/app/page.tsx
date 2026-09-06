import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { SearchControls } from "@/components/search/SearchControls";
import { searchPublishedRecipes } from "@/server/recipes/search-published-recipes";
import {
  searchParametersHref,
  searchQueryHref,
  type SearchParameters,
} from "@/utils/recipe-search-query";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Browse Recipes" };

export default async function Home({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await connection();
  const parameters = await searchParams;
  let result: Awaited<ReturnType<typeof searchPublishedRecipes>> | undefined;
  try {
    result = await searchPublishedRecipes(parameters);
  } catch {
    // A read failure needs a retry, not database details or a misleading empty state.
  }
  return (
    <main className="page-shell" id="main-content">
      <h1>Browse recipes</h1>
      <p>Find something to cook, shared from our kitchens.</p>
      <SearchControls parameters={parameters} />
      {!result ? (
        <div role="alert">
          <p>Recipes could not be loaded. Please try again.</p>
          <a className={styles.retry} href={searchParametersHref(parameters)}>
            Retry search
          </a>
        </div>
      ) : !result.ok ? (
        <div role="alert">
          <p>Correct your search before trying again:</p>
          <ul>
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p role="status">
            {result.total} {result.total === 1 ? "recipe" : "recipes"} found.
          </p>
          {result.recipes.length ? (
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
                    {recipe.explanations.length ? (
                      <ul aria-label="Ingredient filter conditions" className={styles.conditions}>
                        {recipe.explanations.map((explanation) => (
                          <li key={explanation}>{explanation}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {result.query.page > 1
                ? "No recipes on this page."
                : result.query.q || result.query.include.length || result.query.exclude.length
                  ? "No recipes match these terms and filters. Try changing them or clear the search."
                  : "No recipes have been published yet."}
            </p>
          )}
          {result.query.page > 1 || result.hasNextPage ? (
            <nav aria-label="Recipe pages" className={styles.pagination}>
              {result.query.page > 1 ? (
                <Link href={searchQueryHref(result.query, result.query.page - 1)} prefetch={false}>
                  Previous page
                </Link>
              ) : null}
              <span aria-current="page">Page {result.query.page}</span>
              {result.hasNextPage ? (
                <Link href={searchQueryHref(result.query, result.query.page + 1)} prefetch={false}>
                  Next page
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}
