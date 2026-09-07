import { describe, expect, it } from "vitest";
import { parsePublishedRecipeSnapshot } from "./recipe-publication";
import { matchRecipePublication, rankRecipePublications } from "./recipe-search";
import { searchFixtureId, searchSnapshot } from "./recipe-search.test-fixtures";
import { parseRecipeSearch, type SearchParameters } from "./recipe-search-query";

const query = (parameters: SearchParameters = {}) => {
  const result = parseRecipeSearch(parameters);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.query;
};
const publication = () => ({ snapshot: searchSnapshot(), publishedAt: new Date("2026-09-01") });

describe("published recipe matching", () => {
  it("uses a valid publication fixture", () => {
    expect(parsePublishedRecipeSnapshot(1, searchSnapshot())).not.toBeNull();
  });
  it("partially matches case-insensitive canonical and custom names equally", () => {
    const value = publication();
    value.snapshot.ingredients[2].ingredientId = searchFixtureId(90);
    value.snapshot.ingredients[2].customIngredient = null;
    expect(matchRecipePublication(value, query({ include: "BUTTER" }))).not.toBeNull();
    value.snapshot.ingredients.splice(2, 1);
    expect(matchRecipePublication(value, query({ include: "butter" }))).not.toBeNull();
    expect(
      matchRecipePublication(value, query({ include: "butter", exclude: "butter" })),
    ).toBeNull();
  });
  it("allows mutually exclusive included alternatives without cooking preselection", () => {
    const value = publication();
    const original = structuredClone(value);
    expect(matchRecipePublication(value, query({ include: ["chick", "tofu"] }))).not.toBeNull();
    expect(
      matchRecipePublication(value, query({ include: ["chick", "tofu"], exclude: "chick" })),
    ).toBeNull();
    expect(value).toEqual(original);
  });
  it("explains optional omissions and available group choices for partial butter exclusions", () => {
    const match = matchRecipePublication(publication(), query({ exclude: "butter" }));
    expect(match?.explanations).toEqual([
      "Omit optional Peanut butter.",
      "Cooking fat: use Olive oil to avoid Salted butter.",
    ]);
  });
  it("rejects mandatory excluded lines and groups with no allowed options", () => {
    expect(matchRecipePublication(publication(), query({ exclude: "beans" }))).toBeNull();
    expect(matchRecipePublication(publication(), query({ exclude: "butter,oil" }))).toBeNull();
  });
  it("checks repeated names in separate groups and mandatory occurrences independently", () => {
    const value = publication();
    value.snapshot.choiceGroups.push({
      id: searchFixtureId(5),
      sectionId: searchFixtureId(2),
      label: "Brushing fat",
    });
    value.snapshot.ingredients.push(
      {
        ...value.snapshot.ingredients[2],
        id: searchFixtureId(30),
        choiceGroupId: searchFixtureId(5),
        position: 6,
      },
      {
        ...value.snapshot.ingredients[2],
        id: searchFixtureId(31),
        ingredientName: "Peanut butter",
        customIngredient: "Peanut butter",
        choiceGroupId: searchFixtureId(5),
        position: 7,
      },
    );
    expect(matchRecipePublication(value, query({ exclude: "butter" }))).toBeNull();
    value.snapshot.ingredients.at(-1)!.ingredientName = "Canola oil";
    expect(matchRecipePublication(value, query({ exclude: "butter" }))?.explanations).toContain(
      "Brushing fat: use Canola oil to avoid Salted butter.",
    );
    value.snapshot.ingredients.push({
      ...value.snapshot.ingredients[2],
      id: searchFixtureId(32),
      choiceGroupId: null,
      position: 8,
    });
    expect(matchRecipePublication(value, query({ exclude: "butter" }))).toBeNull();
  });
  it("searches any word across titles, descriptions and ingredient names without relaxing filters", () => {
    for (const q of ["STEW nowhere", "warming", "olive"])
      expect(matchRecipePublication(publication(), query({ q }))).not.toBeNull();
    expect(matchRecipePublication(publication(), query({ q: "nowhere" }))).toBeNull();
    expect(
      matchRecipePublication(publication(), query({ q: "stew", include: "tomato" })),
    ).toBeNull();
  });
  it("ranks distinct word coverage before title, ingredient and description, then date and identity", () => {
    const values = Array.from({ length: 5 }, (_, index) => {
      const value = publication();
      value.snapshot.recipe.id = searchFixtureId(index + 40);
      value.snapshot.recipe.title = "Dinner";
      value.snapshot.recipe.description = null;
      return value;
    });
    values[0].snapshot.recipe.description = "red";
    values[1].snapshot.ingredients[0].ingredientName = "red";
    values[2].snapshot.recipe.title = "red";
    values[3].snapshot.recipe.description = "red blue";
    values[4].snapshot.recipe.title = "red";
    expect(
      rankRecipePublications(values.reverse(), query({ q: "red red blue" })).map(
        (match) => match.publication.snapshot.recipe.id,
      ),
    ).toEqual([43, 42, 44, 41, 40].map(searchFixtureId));
  });
  it("sorts newest independently of relevance and falls back for an empty relevance search", () => {
    const older = publication();
    older.snapshot.recipe.id = searchFixtureId(50);
    const newer = publication();
    newer.snapshot.recipe.id = searchFixtureId(51);
    newer.publishedAt = new Date("2026-09-02");
    for (const parameters of [{ sort: "newest", q: "stew" }, { sort: "relevance" }, {}]) {
      expect(rankRecipePublications([older, newer], query(parameters))[0].publication).toBe(newer);
    }
  });
});
