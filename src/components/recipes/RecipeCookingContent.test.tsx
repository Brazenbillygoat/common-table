import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeAlternativeContent } from "@/utils/recipe-alternatives";

import { RecipeCookingContent } from "./RecipeCookingContent";

// Model Next's documented history/search-params synchronization while retaining
// jsdom's native history entries for Back/Forward coverage.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => window.location.pathname,
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          (notify) => {
            window.addEventListener("popstate", notify);
            window.addEventListener("next-history-update", notify);
            return () => {
              window.removeEventListener("popstate", notify);
              window.removeEventListener("next-history-update", notify);
            };
          },
          () => window.location.search,
        ),
      ),
  };
});

const content: RecipeAlternativeContent = {
  sections: [{ id: "section", name: "Filling", position: 0 }],
  choiceGroups: [{ id: "protein", sectionId: "section", label: "Protein" }],
  ingredients: [line("tofu", "Tofu", 0), line("pork", "Pork", 1)],
  steps: [
    { id: "always", position: 0, instruction: "Prepare wrappers." },
    {
      id: "tofu-step",
      position: 1,
      instruction: "Cook tofu.",
      conditionKind: "choice_option",
      conditionIngredientId: "tofu",
      conditionLabel: "Protein: Tofu",
    },
    {
      id: "pork-step",
      position: 2,
      instruction: "Cook pork.",
      conditionKind: "choice_option",
      conditionIngredientId: "pork",
      conditionLabel: "Protein: Pork",
    },
  ],
};

describe("Public cooking continuity", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/r/loaded-recipe?mode=compact#cooking");
    const nativePush = window.history.pushState.bind(window.history);
    vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
      nativePush(data, unused, url);
      window.dispatchEvent(new Event("next-history-update"));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("starts expanded and independently collapses sections with accessible heading buttons", () => {
    render(<RecipeCookingContent content={content} />);

    for (const title of ["Choices", "Ingredients", "Instructions"]) {
      const heading = screen.getByRole("heading", { name: title, level: 2 });
      const toggle = within(heading).getByRole("button", { name: title });
      const controlledContent = document.getElementById(toggle.getAttribute("aria-controls")!);
      expect(toggle).toHaveAttribute("type", "button");
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(controlledContent).toBeVisible();

      toggle.focus();
      expect(toggle).toHaveFocus();
      fireEvent.click(toggle);

      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(controlledContent).toBeInTheDocument();
      expect(controlledContent).not.toBeVisible();
      expect(heading).toBeVisible();
      for (const other of ["Choices", "Ingredients", "Instructions"].filter(
        (name) => name !== title,
      )) {
        expect(screen.getByRole("button", { name: other })).toHaveAttribute(
          "aria-expanded",
          "true",
        );
      }

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(controlledContent).toBeVisible();
    }

    expect(window.history.pushState).not.toHaveBeenCalled();
  });

  it("preserves choices and hide-unused state while sections are collapsed", () => {
    render(<RecipeCookingContent content={content} />);
    const hideUnused = screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" });
    fireEvent.click(hideUnused);
    fireEvent.click(screen.getByRole("radio", { name: "Tofu" }));
    const tofuChoice = screen.getByRole("radio", { name: "Tofu" });
    const selectedUrl = window.location.href;

    for (const title of ["Choices", "Ingredients", "Instructions"]) {
      fireEvent.click(screen.getByRole("button", { name: title }));
    }

    expect(tofuChoice).toBeInTheDocument();
    expect(tofuChoice).not.toBeVisible();
    expect(tofuChoice).toBeChecked();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(hideUnused).toBeChecked();
    expect(window.location.href).toBe(selectedUrl);
    expect(window.history.pushState).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Choices" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pork" }));
    expect(screen.getByRole("button", { name: "Ingredients" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Instructions" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ingredients" }));
    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    expect(hideUnused).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pork" })).toBeChecked();
    const ingredients = within(screen.getByRole("region", { name: "Ingredients" }));
    expect(ingredients.queryByText("Tofu")).not.toBeInTheDocument();
    expect(ingredients.getByText("Pork")).toBeVisible();
    expect(screen.queryByText("Cook tofu.")).not.toBeInTheDocument();
    expect(screen.getByText("Cook pork.").closest("li")).toHaveTextContent("Step 2");
  });

  it("retains loaded content and hidden state through choices and native Back/Forward", async () => {
    render(<RecipeCookingContent content={content} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tofu" }));
    expect(window.history.pushState).toHaveBeenLastCalledWith(
      null,
      "",
      "/r/loaded-recipe?mode=compact&choice=tofu#cooking",
    );
    expect(screen.getByText("Cook tofu.").closest("li")).toHaveTextContent("Step 2");
    expect(screen.queryByText("Cook pork.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Pork" }));
    expect(screen.getByText("Cook pork.").closest("li")).toHaveTextContent("Step 2");
    expect(screen.queryByText("Cook tofu.")).not.toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Tofu" })).toBeChecked());
    expect(
      screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }),
    ).toBeChecked();
    expect(screen.getByText("Cook tofu.").closest("li")).toHaveTextContent("Step 2");

    window.history.forward();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Pork" })).toBeChecked());
    expect(screen.getByText("Cook pork.").closest("li")).toHaveTextContent("Step 2");
    expect(
      screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }),
    ).toBeChecked();
    expect(window.history.pushState).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe("#cooking");
  });

  it("removes stale choices against the loaded recipe and keeps all controls usable", () => {
    window.history.replaceState(
      null,
      "",
      "/r/loaded-recipe?choice=deleted&optional=foreign#cooking",
    );
    render(<RecipeCookingContent content={content} />);
    expect(screen.getByRole("status")).toHaveTextContent("were ignored");
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }));
    expect(
      within(screen.getByRole("region", { name: "Ingredients" })).getAllByRole("listitem"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove invalid choices from URL" }));
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tofu" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Pork" }));
    expect(screen.getByText("Cook pork.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear Protein choice" }));
    expect(screen.getByText("Cook tofu.")).toBeInTheDocument();
    expect(screen.getByText("Cook pork.")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Hide unused ingredients and steps" }),
    ).toBeChecked();
  });
});

function line(id: string, ingredientName: string, position: number) {
  return {
    id,
    sectionId: "section",
    choiceGroupId: "protein",
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
