import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getAllByText("Selected")).toHaveLength(2);
    expect(screen.getAllByText("Not selected").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Cook tofu.").closest("li")).toHaveTextContent("Step 2");
    expect(screen.getByText("Add green onions.").closest("li")).toHaveTextContent(
      "Not in active steps",
    );
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
