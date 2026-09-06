export type SearchParameters = Record<string, string | string[] | undefined>;
export type RecipeSearchQuery = {
  q: string;
  words: string[];
  include: string[];
  exclude: string[];
  sort: "relevance" | "newest";
  page: number;
};

export const SEARCH_LIMITS = { query: 200, words: 20, filters: 10, term: 80, filterText: 1000 };
const supported = ["q", "include", "exclude", "sort", "page"] as const;
const controlCharacters = /[\u0000-\u001f\u007f]/;
const unique = (values: string[]) => [...new Set(values)];

// Preserve invalid supported values too: Browse must explain corrections rather
// than silently widening a search during the legacy redirect.
export function searchParametersHref(parameters: SearchParameters) {
  const output = new URLSearchParams();
  for (const key of supported) {
    const value = parameters[key];
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      output.append(key, item);
  }
  return output.size ? `/?${output}` : "/";
}

export function searchQueryHref(query: RecipeSearchQuery, page = query.page) {
  return searchParametersHref({
    q: query.q || undefined,
    include: query.include,
    exclude: query.exclude,
    sort: query.sort === (query.words.length ? "relevance" : "newest") ? undefined : query.sort,
    page: page === 1 ? undefined : String(page),
  });
}

export function parseRecipeSearch(
  parameters: SearchParameters,
): { ok: true; query: RecipeSearchQuery } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const scalar = (key: string) => {
    const value = parameters[key];
    if (Array.isArray(value)) {
      errors.push(`Use only one ${key} parameter.`);
      return "";
    }
    return value ?? "";
  };
  const rawQuery = scalar("q");
  const q = rawQuery.trim();
  const words = unique(q.toLowerCase().split(/\s+/).filter(Boolean));
  if (rawQuery.length > SEARCH_LIMITS.query || controlCharacters.test(rawQuery))
    errors.push("Use up to 200 search characters without control characters.");
  if (words.length > SEARCH_LIMITS.words) errors.push("Use no more than 20 search words.");
  const filters = (key: "include" | "exclude") => {
    const raw = parameters[key];
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    if (values.length > 1 && values.some((value) => !value.trim()))
      errors.push(`Remove empty ${key} parameters or enter an ingredient term.`);
    if (
      values.length > SEARCH_LIMITS.filters ||
      values.join(",").length > SEARCH_LIMITS.filterText
    ) {
      errors.push(`Shorten ${key} filters to at most 10 terms of 80 characters each.`);
      return [];
    }
    const terms = values.flatMap((value) =>
      value.trim() === "" ? [] : value.split(",").map((term) => term.trim().toLowerCase()),
    );
    if (
      terms.length > SEARCH_LIMITS.filters ||
      terms.some(
        (term) => !term || term.length > SEARCH_LIMITS.term || controlCharacters.test(term),
      )
    )
      errors.push(
        `Use at most 10 nonempty ${key} terms, each up to 80 characters, separated by commas.`,
      );
    return unique(terms);
  };
  const include = filters("include");
  const exclude = filters("exclude");
  const rawSort = scalar("sort");
  if (rawSort && rawSort !== "relevance" && rawSort !== "newest")
    errors.push("Choose relevance or newest sorting.");
  const rawPage = scalar("page");
  const page = rawPage ? Number(rawPage) : 1;
  if (rawPage && (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page) || page > 1_000_000))
    errors.push("Use a whole page number between 1 and 1000000.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    query: {
      q,
      words,
      include,
      exclude,
      sort: rawSort === "newest" || (!rawSort && !words.length) ? "newest" : "relevance",
      page,
    },
  };
}
