import { redirect } from "next/navigation";

import { searchParametersHref, type SearchParameters } from "@/utils/recipe-search-query";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParameters>;
}) {
  redirect(searchParametersHref(await searchParams));
}
