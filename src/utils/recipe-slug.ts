export function createRecipeSlugBase(title: string) {
  return (
    title
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLocaleLowerCase("en-US")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "recipe"
  );
}

export function selectLowestAvailableSlug(base: string, existingSlugs: Iterable<string>) {
  const existing = new Set(existingSlugs);
  if (!existing.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
}
