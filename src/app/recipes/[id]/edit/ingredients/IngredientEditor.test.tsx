import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeIngredientEditorData } from "@/utils/recipe-ingredient";

import { IngredientEditor } from "./IngredientEditor";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const ingredientId = "e785b35e-4ff4-421b-9609-58b889461279";
const data: RecipeIngredientEditorData = {
  recipe: {
    id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
    title: "Family Chili",
    version: 1,
  },
  lines: [],
  ingredientOptions: [{ id: ingredientId, name: "Salt" }],
  unitOptions: [
    {
      id: "a934e125-6bd3-4593-91fd-22c306815b01",
      name: "teaspoon",
      kind: "volume",
    },
  ],
};

describe("IngredientEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the empty state and exact native form modes", async () => {
    render(<IngredientEditor data={data} />);
    expect(screen.getByRole("heading", { name: "No ingredients yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() => expect(screen.getByLabelText("Ingredient")).toHaveFocus());
    expect(screen.getByLabelText("Quantity type")).toHaveTextContent("None");
    expect(screen.getByLabelText("Unit type")).toHaveTextContent("Other");
    expect(screen.getByLabelText("Optional ingredient")).toBeInTheDocument();
  });

  it("clears hidden unit controls when text quantity is selected", () => {
    render(<IngredientEditor data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByLabelText("Unit type"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Other unit"), {
      target: { value: "pinch" },
    });
    fireEvent.change(screen.getByLabelText("Quantity type"), {
      target: { value: "text" },
    });
    expect(screen.queryByLabelText("Unit type")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Quantity type"), {
      target: { value: "none" },
    });
    expect(screen.getByLabelText("Unit type")).toHaveValue("none");
  });

  it("preserves values and focuses the validation summary", async () => {
    render(<IngredientEditor data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByLabelText("Ingredient type"), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Other ingredient"), {
      target: { value: "Chile crisp" },
    });
    fireEvent.change(screen.getByLabelText("Quantity type"), {
      target: { value: "single" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Fix the following ingredient fields:" }).parentElement,
      ).toHaveFocus(),
    );
    expect(screen.getByLabelText("Other ingredient")).toHaveValue("Chile crisp");
  });

  it("adds only after a successful response and replaces the version", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            version: 2,
            line: {
              id: ingredientId,
              position: 0,
              ingredientId,
              ingredientName: "Salt",
              customIngredient: null,
              quantityMin: null,
              quantityMax: null,
              quantityText: null,
              unitId: null,
              unitName: null,
              customUnit: null,
              preparationNote: null,
              isOptional: false,
            },
          },
        }),
        { status: 201 },
      ),
    );
    render(<IngredientEditor data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByLabelText("Ingredient"), {
      target: { value: ingredientId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(await screen.findByRole("list")).toHaveTextContent("Salt");
    expect(screen.getByText("Ingredient saved.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/ingredients"),
      expect.objectContaining({
        body: expect.stringContaining('"expectedVersion":1'),
      }),
    );
  });

  it("locks mutations on conflict and deliberately refreshes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "VERSION_CONFLICT" } }), {
        status: 409,
      }),
    );
    render(<IngredientEditor data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByLabelText("Ingredient"), {
      target: { value: ingredientId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(
      await screen.findByRole("heading", { name: "This draft changed elsewhere." }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("announces that changes were not saved after a failed mutation", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "INGREDIENT_CHANGE_FAILED" },
        }),
        { status: 500 },
      ),
    );
    render(<IngredientEditor data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByLabelText("Ingredient"), {
      target: { value: ingredientId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));

    expect(await screen.findByText("Changes not saved.")).toBeInTheDocument();
    expect(screen.queryByText("Draft saved")).not.toBeInTheDocument();
  });
});
