import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeAlternativeContent } from "@/utils/recipe-alternatives";

import { RecipePreview } from "./RecipePreview";

const mocks = vi.hoisted(() => ({ push: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/recipes/recipe/edit/preview",
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

const sectionId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const proteinGroupId = "e785b35e-4ff4-421b-9609-58b889461279";
const oilGroupId = "de5797ee-837d-48ea-8367-69ea4033be6f";
const tofuId = "a934e125-6bd3-4593-91fd-22c306815b01";
const porkId = "a66e9487-0208-4389-a2ab-80484cf9d6f2";
const canolaId = "cd5bda33-a782-41fd-ac25-1774d8b83771";
const avocadoId = "f4275994-4004-448f-b1fd-0d64f3f8ee65";
const optionalId = "ef515bea-3ea8-4c62-b803-4649b6ec9c7e";

const content: RecipeAlternativeContent = {
  sections: [{ id: sectionId, name: "Filling", position: 0 }],
  choiceGroups: [
    { id: proteinGroupId, sectionId, label: "Protein" },
    { id: oilGroupId, sectionId, label: "Cooking oil" },
  ],
  ingredients: [
    line(tofuId, 0, "Tofu", proteinGroupId),
    line(porkId, 1, "Pork", proteinGroupId),
    line(canolaId, 2, "Canola oil", oilGroupId),
    line(avocadoId, 3, "Avocado oil", oilGroupId),
    { ...line(optionalId, 4, "Green onions", null), isOptional: true },
  ],
  steps: [
    { id: "always", position: 0, instruction: "Prepare wrappers." },
    {
      id: "tofu",
      position: 1,
      instruction: "Cook tofu.",
      conditionKind: "choice_option",
      conditionIngredientId: tofuId,
      conditionLabel: "Protein: Tofu",
    },
    {
      id: "onions",
      position: 2,
      instruction: "Add green onions.",
      conditionKind: "optional_ingredient",
      conditionIngredientId: optionalId,
      conditionLabel: "Optional: Green onions",
    },
  ],
};

describe("RecipePreview", () => {
  beforeEach(() => {
    mocks.query = "";
    vi.clearAllMocks();
  });

  it("shows all branches, explicit states, and contiguous active numbering", () => {
    mocks.query = `choice=${tofuId}&choice=${canolaId}`;
    render(<RecipePreview content={content} />);

    expect(screen.getByRole("radio", { name: "Tofu" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Canola oil" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Green onions" })).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }),
    ).not.toBeChecked();
    expect(screen.getAllByText("Selected")).toHaveLength(2);
    expect(screen.getAllByText("Not selected").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Cook tofu.").closest("li")).toHaveTextContent("Step 2");
    expect(screen.getByText("Add green onions.").closest("li")).toHaveTextContent(
      "Not in active steps",
    );
  });

  it("hides unused list items and restores them without changing choices or navigating", () => {
    mocks.query = `choice=${tofuId}&choice=${canolaId}`;
    render(<RecipePreview content={content} />);
    const ingredients = within(screen.getByRole("region", { name: "Ingredients" }));
    const instructions = within(screen.getByRole("region", { name: "Instructions" }));
    const visibility = screen.getByRole("checkbox", {
      name: "Hide unused ingredients and steps",
    });

    fireEvent.click(visibility);

    expect(visibility).toBeChecked();
    expect(ingredients.getAllByRole("listitem")).toHaveLength(2);
    expect(ingredients.getByText("Tofu")).toBeInTheDocument();
    expect(ingredients.getByText("Canola oil")).toBeInTheDocument();
    expect(ingredients.queryByText("Pork")).not.toBeInTheDocument();
    expect(ingredients.queryByText("Avocado oil")).not.toBeInTheDocument();
    expect(ingredients.queryByText("Green onions (optional)")).not.toBeInTheDocument();
    expect(instructions.getAllByRole("listitem")).toHaveLength(2);
    expect(instructions.getByText("Prepare wrappers.").closest("li")).toHaveTextContent("Step 1");
    expect(instructions.getByText("Cook tofu.").closest("li")).toHaveTextContent("Step 2");
    expect(instructions.queryByText("Add green onions.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Tofu" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pork" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Green onions" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Clear Protein choice" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Clear Cooking oil choice" })).toBeEnabled();

    fireEvent.click(visibility);

    expect(visibility).not.toBeChecked();
    expect(ingredients.getAllByRole("listitem")).toHaveLength(5);
    expect(ingredients.getByText("Pork")).toBeInTheDocument();
    expect(ingredients.getByText("Avocado oil")).toBeInTheDocument();
    expect(ingredients.getByText("Green onions (optional)")).toBeInTheDocument();
    expect(instructions.getAllByRole("listitem")).toHaveLength(3);
    expect(instructions.getByText("Add green onions.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tofu" })).toBeChecked();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps undecided ingredients and instructions visible when unused items are hidden", () => {
    render(<RecipePreview content={content} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }));
    const ingredients = within(screen.getByRole("region", { name: "Ingredients" }));
    const instructions = within(screen.getByRole("region", { name: "Instructions" }));

    expect(ingredients.getAllByRole("listitem")).toHaveLength(4);
    expect(ingredients.getAllByText("Undecided")).toHaveLength(4);
    expect(ingredients.getByText("Tofu")).toBeInTheDocument();
    expect(ingredients.getByText("Pork")).toBeInTheDocument();
    expect(instructions.getByText("Cook tofu.").closest("li")).toHaveTextContent(
      "Undecided: Protein: Tofu",
    );
    expect(instructions.getByText("Cook tofu.").closest("li")).toHaveTextContent(
      "Not in active steps",
    );
    expect(instructions.queryByText("Add green onions.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("keeps hiding enabled as URL selections change and preserves authored order and numbering", () => {
    mocks.query = `choice=${tofuId}&choice=${canolaId}`;
    const rendered = render(<RecipePreview content={content} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pork" }));
    expect(mocks.push).toHaveBeenCalledWith(
      `/recipes/recipe/edit/preview?choice=${canolaId}&choice=${porkId}`,
      { scroll: false },
    );

    mocks.query = `choice=${porkId}&choice=${canolaId}&optional=${optionalId}`;
    rendered.rerender(<RecipePreview content={content} />);
    const ingredients = within(screen.getByRole("region", { name: "Ingredients" }));
    const instructions = within(screen.getByRole("region", { name: "Instructions" }));

    expect(
      screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }),
    ).toBeChecked();
    expect(
      ingredients.getAllByRole("listitem").map((item) => item.textContent?.replace(/\s+/g, " ")),
    ).toEqual(["PorkSelected", "Canola oilSelected", "Green onions (optional)Selected"]);
    expect(instructions.queryByText("Cook tofu.")).not.toBeInTheDocument();
    expect(instructions.getAllByRole("listitem")[0]).toHaveTextContent("Step 1Prepare wrappers.");
    expect(instructions.getAllByRole("listitem")[1]).toHaveTextContent("Step 2Add green onions.");

    fireEvent.click(screen.getByRole("button", { name: "Clear Protein choice" }));
    mocks.query = `choice=${canolaId}&optional=${optionalId}`;
    rendered.rerender(<RecipePreview content={content} />);

    expect(
      screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }),
    ).toBeChecked();
    expect(ingredients.getByText("Tofu")).toBeInTheDocument();
    expect(ingredients.getByText("Pork")).toBeInTheDocument();
    expect(instructions.getByText("Cook tofu.").closest("li")).toHaveTextContent("Undecided");
    expect(instructions.getByText("Add green onions.").closest("li")).toHaveTextContent("Step 2");
  });

  it("suppresses ingredient sections emptied by hiding and restores their headings", () => {
    const garnishSectionId = "afc0fa97-c0d8-4f22-8baf-49d168c899be";
    const sectionedContent: RecipeAlternativeContent = {
      ...content,
      sections: [...content.sections, { id: garnishSectionId, name: "Garnish", position: 1 }],
      ingredients: content.ingredients.map((ingredient) =>
        ingredient.id === optionalId ? { ...ingredient, sectionId: garnishSectionId } : ingredient,
      ),
    };
    render(<RecipePreview content={sectionedContent} />);
    const ingredients = within(screen.getByRole("region", { name: "Ingredients" }));
    const visibility = screen.getByRole("checkbox", {
      name: "Hide unused ingredients and steps",
    });
    expect(ingredients.getByRole("heading", { name: "Garnish" })).toBeInTheDocument();

    fireEvent.click(visibility);

    expect(ingredients.queryByRole("heading", { name: "Garnish" })).not.toBeInTheDocument();
    expect(ingredients.getByRole("heading", { name: "Filling" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Green onions" })).toBeInTheDocument();

    fireEvent.click(visibility);

    expect(ingredients.getByRole("heading", { name: "Garnish" })).toBeInTheDocument();
    expect(ingredients.getByText("Green onions (optional)")).toBeInTheDocument();
  });

  it("explains when selections hide all authored ingredients and steps", () => {
    const optionalContent: RecipeAlternativeContent = {
      ...content,
      choiceGroups: [],
      ingredients: content.ingredients.filter((ingredient) => ingredient.id === optionalId),
      steps: content.steps.filter((step) => step.id === "onions"),
    };
    render(<RecipePreview content={optionalContent} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }));
    const ingredients = within(screen.getByRole("region", { name: "Ingredients" }));
    const instructions = within(screen.getByRole("region", { name: "Instructions" }));

    expect(ingredients.queryAllByRole("listitem")).toHaveLength(0);
    expect(ingredients.queryByRole("heading", { name: "Filling" })).not.toBeInTheDocument();
    expect(
      ingredients.getByText("No ingredients apply to the current selections."),
    ).toBeInTheDocument();
    expect(instructions.queryAllByRole("listitem")).toHaveLength(0);
    expect(instructions.getByText("No steps apply to the current selections.")).toBeInTheDocument();
    expect(instructions.queryByText("No instructions yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include Green onions" })).toBeEnabled();
  });

  it("keeps the empty draft instruction message when hiding unused items", () => {
    render(<RecipePreview content={{ ...content, steps: [] }} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }));
    const instructions = within(screen.getByRole("region", { name: "Instructions" }));

    expect(instructions.getByText("No instructions yet.")).toBeInTheDocument();
    expect(
      instructions.queryByText("No steps apply to the current selections."),
    ).not.toBeInTheDocument();
  });

  it("writes validated repeated parameters and restores state from changed URL input", () => {
    mocks.query = `mode=compact&choice=${tofuId}&choice=${canolaId}`;
    const rendered = render(<RecipePreview content={content} />);
    fireEvent.click(screen.getByRole("radio", { name: "Pork" }));
    expect(mocks.push).toHaveBeenCalledWith(
      `/recipes/recipe/edit/preview?mode=compact&choice=${canolaId}&choice=${porkId}`,
      { scroll: false },
    );

    mocks.query = `choice=${porkId}&optional=${optionalId}`;
    rendered.rerender(<RecipePreview content={content} />);
    expect(screen.getByRole("radio", { name: "Pork" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include Green onions" })).toBeChecked();
    expect(screen.getByText("Add green onions.").closest("li")).toHaveTextContent("Step 2");
  });

  it("announces and removes stale URL selections without substituting a branch", () => {
    const stale = "11111111-1111-4111-8111-111111111111";
    mocks.query = `mode=compact&choice=${stale}`;
    render(<RecipePreview content={content} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Some URL choices were invalid or no longer belong to this recipe and were ignored.",
    );
    expect(screen.getAllByText("Undecided").length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole("button", { name: "Remove invalid choices from URL" }));
    expect(mocks.push).toHaveBeenCalledWith("/recipes/recipe/edit/preview?mode=compact", {
      scroll: false,
    });
  });
});

function line(id: string, position: number, ingredientName: string, choiceGroupId: string | null) {
  return {
    id,
    sectionId,
    choiceGroupId,
    position,
    ingredientId: null,
    ingredientName,
    customIngredient: ingredientName,
    quantityMin: null,
    quantityMax: null,
    quantityText: null,
    unitId: null,
    unitName: null,
    customUnit: null,
    preparationNote: null,
    isOptional: false,
  };
}
