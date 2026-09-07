import { rankRecipePublications, type SearchablePublication } from "./recipe-search";
import { parseRecipeSearch, type SearchParameters } from "./recipe-search-query";

export function searchPublications(
  publications: SearchablePublication[],
  parameters: SearchParameters,
) {
  const parsed = parseRecipeSearch(parameters);
  if (!parsed.ok) return parsed;
  const matches = rankRecipePublications(publications, parsed.query);
  const offset = (parsed.query.page - 1) * 20;
  return {
    ok: true as const,
    query: parsed.query,
    total: matches.length,
    hasNextPage: offset + 20 < matches.length,
    recipes: matches
      .slice(offset, offset + 20)
      .map(({ publication: { snapshot }, explanations }) => ({
        slug: snapshot.recipe.slug,
        title: snapshot.recipe.title,
        description: snapshot.recipe.description,
        authorDisplayName: snapshot.authorDisplayName,
        explanations,
      })),
  };
}
