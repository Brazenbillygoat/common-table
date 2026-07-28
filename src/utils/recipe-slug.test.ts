import { describe, expect, it } from "vitest";

import { createRecipeSlugBase, selectLowestAvailableSlug } from "./recipe-slug";

describe("recipe slug utilities", () => {
  it.each([
    ["Family Chili", "family-chili"],
    ["  FAMILY   Chili  ", "family-chili"],
    ["Crème brûlée", "creme-brulee"],
    ["Fish & Chips", "fish-and-chips"],
    ["!!!", "recipe"],
  ])("creates the expected base slug", (title, expected) => {
    expect(createRecipeSlugBase(title)).toBe(expected);
  });

  it("selects the lowest available numeric suffix", () => {
    expect(selectLowestAvailableSlug("chili", ["chili", "chili-2", "chili-4"])).toBe("chili-3");
  });
});
