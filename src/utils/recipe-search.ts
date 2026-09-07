import type { PublishedRecipeSnapshot } from "./recipe-publication";
import type { RecipeSearchQuery } from "./recipe-search-query";

export type SearchablePublication = { snapshot: PublishedRecipeSnapshot; publishedAt: Date };
export type RecipeSearchMatch = {
  publication: SearchablePublication;
  score: [number, number, number, number];
  explanations: string[];
};

// Each ingredient occurrence matters: the same name can be mandatory in one
// place and an alternative in another independent group.
export function matchRecipePublication(
  publication: SearchablePublication,
  query: RecipeSearchQuery,
): RecipeSearchMatch | null {
  const { snapshot } = publication;
  const excluded = (name: string) =>
    query.exclude.some((term) => name.toLowerCase().includes(term));
  const allowed = snapshot.ingredients.filter((line) => !excluded(line.ingredientName));
  const explanations: string[] = [];
  for (const line of snapshot.ingredients) {
    if (line.choiceGroupId || !excluded(line.ingredientName)) continue;
    if (!line.isOptional) return null;
    explanations.push(`Omit optional ${line.ingredientName}.`);
  }
  for (const group of snapshot.choiceGroups) {
    const options = snapshot.ingredients.filter((line) => line.choiceGroupId === group.id);
    const remaining = options.filter((line) => !excluded(line.ingredientName));
    if (!remaining.length) return null;
    if (remaining.length < options.length)
      explanations.push(
        `${group.label}: use ${remaining.map((line) => line.ingredientName).join(" or ")} to avoid ${options
          .filter((line) => excluded(line.ingredientName))
          .map((line) => line.ingredientName)
          .join(", ")}.`,
      );
  }
  // Includes need not coexist in one cooking configuration.
  if (
    !query.include.every((term) =>
      allowed.some((line) => line.ingredientName.toLowerCase().includes(term)),
    )
  )
    return null;
  const title = snapshot.recipe.title.toLowerCase();
  const description = (snapshot.recipe.description ?? "").toLowerCase();
  const names = snapshot.ingredients.map((line) => line.ingredientName.toLowerCase());
  const score: RecipeSearchMatch["score"] = [0, 0, 0, 0];
  for (const word of query.words) {
    const fields = [
      title.includes(word),
      names.some((name) => name.includes(word)),
      description.includes(word),
    ];
    if (fields.some(Boolean)) score[0] += 1;
    fields.forEach((matched, index) => {
      if (matched) score[index + 1] += 1;
    });
  }
  if (query.words.length && !score[0]) return null;
  return { publication, score, explanations: [...new Set(explanations)] };
}

export function rankRecipePublications(
  publications: SearchablePublication[],
  query: RecipeSearchQuery,
) {
  return publications
    .flatMap((publication) => {
      const match = matchRecipePublication(publication, query);
      return match ? [match] : [];
    })
    .sort((left, right) => {
      if (query.sort === "relevance" && query.words.length) {
        for (let index = 0; index < left.score.length; index += 1) {
          const difference = right.score[index] - left.score[index];
          if (difference) return difference;
        }
      }
      const byDate =
        right.publication.publishedAt.getTime() - left.publication.publishedAt.getTime();
      if (byDate) return byDate;
      const leftId = left.publication.snapshot.recipe.id;
      const rightId = right.publication.snapshot.recipe.id;
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
}
