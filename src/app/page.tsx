import type { Metadata } from "next";
import { connection } from "next/server";
import { BrowseContent } from "@/components/search/BrowseContent";
import { searchPublishedRecipes } from "@/server/recipes/search-published-recipes";
import type { SearchParameters } from "@/utils/recipe-search-query";
export const metadata: Metadata = { title: "Browse Recipes" };
export default async function Home({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  await connection();
  const parameters = await searchParams;
  let result: Awaited<ReturnType<typeof searchPublishedRecipes>> | undefined;
  try {
    result = await searchPublishedRecipes(parameters);
  } catch {
    /* Keep database failures distinct from an empty collection. */
  }
  return <BrowseContent parameters={parameters} result={result} />;
}
