import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeEditNavigation } from "./RecipeEditNavigation";

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";

describe("RecipeEditNavigation", () => {
  it("links every recipe editing destination and marks the current stage", () => {
    render(<RecipeEditNavigation currentStage="instructions" recipeId={recipeId} />);
    expect(screen.getByRole("navigation", { name: "Recipe editing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ingredients" })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/ingredients`,
    );
    expect(screen.getByRole("link", { name: "Instructions" })).toHaveAttribute(
      "href",
      `/recipes/${recipeId}/edit/instructions`,
    );
    expect(screen.getByRole("link", { name: "Instructions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "My recipes" })).toHaveAttribute("href", "/recipes");
  });
});
