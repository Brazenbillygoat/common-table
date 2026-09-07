import { describe, expect, it } from "vitest";
import {
  parseRecipeSearch,
  searchParametersHref,
  searchQueryHref,
  type SearchParameters,
} from "./recipe-search-query";

describe("search URL rules", () => {
  it("defaults empty search to newest and normalizes words and ingredient terms", () => {
    expect(parseRecipeSearch({})).toMatchObject({
      ok: true,
      query: { sort: "newest", page: 1, words: [] },
    });
    expect(
      parseRecipeSearch({ q: " Beans BEANS stew ", include: ["Chicken, Tofu", "chicken"] }),
    ).toMatchObject({
      ok: true,
      query: { words: ["beans", "stew"], include: ["chicken", "tofu"], sort: "relevance" },
    });
  });
  it.each<SearchParameters>([
    { q: ["a", "b"] },
    { q: "a".repeat(201) },
    { q: Array.from({ length: 21 }, (_, i) => String(i)).join(" ") },
    { include: "butter,,tofu" },
    { include: ["butter", ""] },
    { exclude: "butter," },
    { include: "a".repeat(81) },
    { exclude: Array.from({ length: 11 }, () => "a") },
    { exclude: "a".repeat(1001) },
    { include: "but\u0000ter" },
    { q: "a\u0000b" },
    { sort: "surprise" },
    { sort: ["newest", "relevance"] },
    { page: "0" },
    { page: "2junk" },
    { page: "2.5" },
    { page: "9007199254740992" },
    { page: ["2", "3"] },
  ])("rejects invalid input without returning a broadened query: %j", (parameters) => {
    const parsed = parseRecipeSearch(parameters);
    expect(parsed.ok).toBe(false);
    expect(parsed).not.toHaveProperty("query");
  });
  it("round-trips all applied filters and sorting through pagination URLs", () => {
    const parsed = parseRecipeSearch({
      q: "beans & rice",
      include: ["olive oil", "tofu"],
      exclude: "butter",
      sort: "newest",
    });
    if (!parsed.ok) throw new Error("Invalid fixture");
    const href = searchQueryHref(parsed.query, 2);
    const parameters: SearchParameters = {};
    for (const [key, value] of new URL(href, "https://example.invalid").searchParams) {
      parameters[key] = parameters[key] === undefined ? value : [parameters[key] as string, value];
    }
    expect(parseRecipeSearch(parameters)).toEqual({
      ok: true,
      query: { ...parsed.query, page: 2 },
    });
    expect(searchQueryHref({ ...parsed.query, page: 2 }, 1)).not.toContain("page=");
  });
  it("preserves invalid supported raw values in redirects and retry URLs", () => {
    expect(
      searchParametersHref({ q: ["a", "b"], include: "butter,,oil", page: "bad", unknown: "drop" }),
    ).toBe("/?q=a&q=b&include=butter%2C%2Coil&page=bad");
    expect(searchParametersHref({})).toBe("/");
  });
});
