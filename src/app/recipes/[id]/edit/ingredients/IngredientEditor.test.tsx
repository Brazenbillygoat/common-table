import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeIngredientEditorData, RecipeIngredientLine } from "@/utils/recipe-ingredient";

import { IngredientEditor } from "./IngredientEditor";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const recipeId = "34053bb6-c957-4d2d-a621-b2e34b774a1d";
const ingredientId = "e785b35e-4ff4-421b-9609-58b889461279";
const pepperId = "de5797ee-837d-48ea-8367-69ea4033be6f";
const unitId = "a934e125-6bd3-4593-91fd-22c306815b01";
const lineId = "a66e9487-0208-4389-a2ab-80484cf9d6f2";
const secondLineId = "cd5bda33-a782-41fd-ac25-1774d8b83771";
const firstSectionId = "f4275994-4004-448f-b1fd-0d64f3f8ee65";
const secondSectionId = "ef515bea-3ea8-4c62-b803-4649b6ec9c7e";

const data: RecipeIngredientEditorData = {
  recipe: { id: recipeId, title: "Family Chili", version: 1 },
  lines: [],
  ingredientOptions: [
    { id: ingredientId, name: "Salt" },
    { id: pepperId, name: "Black pepper" },
  ],
  unitOptions: [{ id: unitId, name: "teaspoon", kind: "volume" }],
};

function makeLine(overrides: Partial<RecipeIngredientLine> = {}): RecipeIngredientLine {
  return {
    id: lineId,
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
    ...overrides,
  };
}

function successfulResponse(line: RecipeIngredientLine = makeLine(), version = 2) {
  return new Response(JSON.stringify({ data: { version, line } }), { status: 201 });
}

function openNewIngredient() {
  fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
  return screen.getByRole("combobox", { name: "Ingredient" });
}

function chooseCanonicalIngredient(name = "Salt") {
  const input = screen.getByRole("combobox", { name: "Ingredient" });
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole("option", { name }));
  return input;
}

function submittedBody(callIndex = 0) {
  const request = vi.mocked(fetch).mock.calls[callIndex]?.[1];
  return JSON.parse(request?.body as string) as Record<string, unknown>;
}

describe("IngredientEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses the approved fieldset hierarchy without implementation-mode selects", async () => {
    render(<IngredientEditor data={data} />);
    expect(screen.getByRole("heading", { name: "No ingredients yet" })).toBeInTheDocument();
    openNewIngredient();

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Ingredient" })).toHaveFocus());
    expect(screen.getByRole("group", { name: "Ingredient" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Quantity (optional)" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Details (optional)" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ingredient type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unit type")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Amount (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Unit (optional)")).toHaveTextContent(
      "No unitteaspoonOther unit...",
    );
    expect(screen.getByLabelText("This ingredient is optional")).toBeInTheDocument();
  });

  it("switches explicitly between canonical and custom ingredients with focus and clearing", async () => {
    render(<IngredientEditor data={data} />);
    openNewIngredient();

    fireEvent.click(screen.getByRole("button", { name: "Enter another ingredient" }));
    await waitFor(() => expect(screen.getByLabelText("Other ingredient")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Other ingredient"), {
      target: { value: "Chile crisp" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose from ingredient list" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Ingredient" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Enter another ingredient" }));
    expect(screen.getByLabelText("Other ingredient")).toHaveValue("");
  });

  it("never submits unmatched picker text and links validation to the active control", async () => {
    render(<IngredientEditor data={data} />);
    const input = openNewIngredient();
    fireEvent.change(input, { target: { value: "Dragon salt" } });

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));

    const summary = screen.getByRole("heading", {
      name: "Fix the following ingredient fields:",
    }).parentElement;
    await waitFor(() => expect(summary).toHaveFocus());
    expect(input).toHaveValue("Dragon salt");
    expect(input).toHaveAccessibleDescription("Choose an ingredient.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits an empty or cleared amount as no quantity", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulResponse());
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    const amount = screen.getByLabelText("Amount (optional)");
    fireEvent.change(amount, { target: { value: "2" } });
    expect(amount).toHaveValue("2");
    fireEvent.change(amount, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(submittedBody()).toMatchObject({
      quantityMode: "none",
      quantityMin: "",
      quantityMax: "",
      quantityText: "",
    });
  });

  it("adds and removes an ending amount without losing the starting amount", async () => {
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    fireEvent.change(screen.getByLabelText("Amount (optional)"), { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: "Add an ending amount" }));
    await waitFor(() => expect(screen.getByLabelText("Ending amount")).toHaveFocus());
    expect(screen.getByLabelText("Starting amount")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("Ending amount"), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Remove ending amount" }));
    expect(screen.getByLabelText("Amount (optional)")).toHaveValue("1");
    expect(screen.queryByLabelText("Ending amount")).not.toBeInTheDocument();
  });

  it("swaps written and numeric quantity modes without parsing or retaining hidden values", async () => {
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    fireEvent.change(screen.getByLabelText("Amount (optional)"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Unit (optional)"), {
      target: { value: "__custom" },
    });
    await waitFor(() => expect(screen.getByLabelText("Other unit")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Other unit"), { target: { value: "pinch" } });

    fireEvent.click(screen.getByRole("button", { name: "Use a written quantity" }));
    await waitFor(() => expect(screen.getByLabelText("Quantity text")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("Quantity text"), { target: { value: "a splash" } });
    expect(screen.queryByLabelText("Unit (optional)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use a numeric amount" }));
    await waitFor(() => expect(screen.getByLabelText("Amount (optional)")).toHaveFocus());
    expect(screen.getByLabelText("Amount (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Unit (optional)")).toHaveValue("__none");
    expect(screen.queryByLabelText("Quantity text")).not.toBeInTheDocument();
  });

  it("maps no unit to the unchanged request fields", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulResponse());
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(submittedBody()).toMatchObject({ unitSource: "none", unitId: "", customUnit: "" });
  });

  it("maps a canonical unit to the unchanged request fields", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulResponse());
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    fireEvent.change(screen.getByLabelText("Unit (optional)"), { target: { value: unitId } });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(submittedBody()).toMatchObject({
      unitSource: "canonical",
      unitId,
      customUnit: "",
    });
  });

  it("reveals, focuses, validates, clears, and maps a custom unit", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulResponse());
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    const unit = screen.getByLabelText("Unit (optional)");
    fireEvent.change(unit, { target: { value: "__custom" } });
    await waitFor(() => expect(screen.getByLabelText("Other unit")).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    const summary = screen.getByRole("heading", {
      name: "Fix the following ingredient fields:",
    }).parentElement;
    await waitFor(() => expect(summary).toHaveFocus());
    fireEvent.click(screen.getByRole("link", { name: "Enter a unit." }));
    expect(screen.getByLabelText("Other unit")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("Other unit"), { target: { value: "pinch" } });
    fireEvent.change(unit, { target: { value: unitId } });
    expect(screen.queryByLabelText("Other unit")).not.toBeInTheDocument();
    fireEvent.change(unit, { target: { value: "__custom" } });
    expect(screen.getByLabelText("Other unit")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Other unit"), { target: { value: "pinch" } });
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(submittedBody()).toMatchObject({
      unitSource: "custom",
      unitId: "",
      customUnit: "pinch",
    });
  });

  it("initializes existing canonical, custom, single, range, and written lines", async () => {
    const existingLines = [
      makeLine({ quantityMin: 2, unitId, unitName: "teaspoon" }),
      makeLine({
        id: secondLineId,
        position: 1,
        quantityMin: 1,
        quantityMax: 2,
        customUnit: "handful",
        unitName: "handful",
      }),
      makeLine({
        id: "134a1f55-3c9c-4f12-8a83-8a5eb3b936fd",
        position: 2,
        quantityText: "to taste",
      }),
      makeLine({
        id: "9ab24aba-b687-4b96-914c-c30fbdfab75c",
        position: 3,
        ingredientId: null,
        ingredientName: "Chile crisp",
        customIngredient: "Chile crisp",
      }),
    ];
    render(<IngredientEditor data={{ ...data, lines: existingLines }} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByRole("combobox", { name: "Ingredient" })).toHaveValue("Salt");
    expect(screen.getByLabelText("Amount (optional)")).toHaveValue("2");
    expect(screen.getByLabelText("Unit (optional)")).toHaveValue(unitId);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(screen.getByLabelText("Starting amount")).toHaveValue("1");
    expect(screen.getByLabelText("Ending amount")).toHaveValue("2");
    expect(screen.getByLabelText("Other unit")).toHaveValue("handful");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[2]);
    expect(screen.getByLabelText("Quantity text")).toHaveValue("to taste");
    expect(screen.queryByLabelText("Unit (optional)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[3]);
    expect(screen.getByLabelText("Other ingredient")).toHaveValue("Chile crisp");
  });

  it("submits an exactly compatible range payload and clarified optional boolean", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulResponse());
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    fireEvent.change(screen.getByLabelText("Amount (optional)"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add an ending amount" }));
    fireEvent.change(screen.getByLabelText("Ending amount"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Unit (optional)"), { target: { value: unitId } });
    fireEvent.change(screen.getByLabelText("Preparation note"), { target: { value: "divided" } });
    fireEvent.click(screen.getByLabelText("This ingredient is optional"));

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(submittedBody()).toEqual({
      expectedVersion: 1,
      ingredientSource: "canonical",
      ingredientId,
      customIngredient: "",
      quantityMode: "range",
      quantityMin: "1.5",
      quantityMax: "2.5",
      quantityText: "",
      unitSource: "canonical",
      unitId,
      customUnit: "",
      preparationNote: "divided",
      isOptional: true,
    });
  });

  it("preserves visible work and focuses the validation summary", async () => {
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    fireEvent.click(screen.getByRole("button", { name: "Enter another ingredient" }));
    fireEvent.change(screen.getByLabelText("Other ingredient"), {
      target: { value: "Chile crisp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add an ending amount" }));

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    const summary = screen.getByRole("heading", {
      name: "Fix the following ingredient fields:",
    }).parentElement;
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getByLabelText("Other ingredient")).toHaveValue("Chile crisp");
  });

  it("adds only after success, replaces the version, and locks actions while pending", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add ingredient" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await act(async () => resolveResponse(successfulResponse()));
    expect(await screen.findByRole("list")).toHaveTextContent("Salt");
    expect(screen.getByText("Ingredient saved.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/ingredients"),
      expect.objectContaining({ body: expect.stringContaining('"expectedVersion":1') }),
    );
  });

  it("restores edit-button focus after Cancel", async () => {
    render(<IngredientEditor data={{ ...data, lines: [makeLine()] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus());
  });

  it("locks mutations on conflict and deliberately refreshes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "VERSION_CONFLICT" } }), { status: 409 }),
    );
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));

    expect(
      await screen.findByRole("heading", { name: "This draft changed elsewhere." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload draft" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("announces failure and preserves the selected ingredient", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INGREDIENT_CHANGE_FAILED" } }), {
        status: 500,
      }),
    );
    render(<IngredientEditor data={data} />);
    openNewIngredient();
    chooseCanonicalIngredient();
    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));

    expect(await screen.findByText("Changes not saved.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ingredient" })).toHaveValue("Salt");
    expect(screen.queryByText("Draft saved")).not.toBeInTheDocument();
  });

  it("deletes only after server confirmation and compacts the visible list", async () => {
    const first = makeLine();
    const second = makeLine({
      id: secondLineId,
      position: 1,
      ingredientId: pepperId,
      ingredientName: "Black pepper",
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            version: 2,
            deletedIngredientId: lineId,
            ingredientIds: [secondLineId],
          },
        }),
        { status: 200 },
      ),
    );
    render(<IngredientEditor data={{ ...data, lines: [first, second] }} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    fireEvent.click(
      within(screen.getByText("Delete ingredient?").parentElement!).getByRole("button", {
        name: "Delete",
      }),
    );
    expect(screen.getByRole("list")).toHaveTextContent("Salt");
    await waitFor(() => expect(screen.getByRole("list")).not.toHaveTextContent("Salt"));
    expect(screen.getByRole("list")).toHaveTextContent("Black pepper");
  });

  it("reorders only after server confirmation with the last confirmed version", async () => {
    const first = makeLine();
    const second = makeLine({
      id: secondLineId,
      position: 1,
      ingredientId: pepperId,
      ingredientName: "Black pepper",
    });
    let resolveResponse!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    render(<IngredientEditor data={{ ...data, lines: [first, second] }} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[1]);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Salt");
    expect(submittedBody()).toEqual({
      expectedVersion: 1,
      ingredientIds: [secondLineId, lineId],
    });

    await act(async () =>
      resolveResponse(
        new Response(JSON.stringify({ data: { version: 2 } }), {
          status: 200,
        }),
      ),
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Black pepper");
  });

  it("converts a standalone line into a labeled alternative with a nonoptional option", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { version: 2, groupId: crypto.randomUUID() } }), {
        status: 200,
      }),
    );
    render(
      <IngredientEditor
        data={{
          ...data,
          sections: [{ id: firstSectionId, name: "Filling", position: 0 }],
          choiceGroups: [],
          lines: [makeLine({ sectionId: firstSectionId, choiceGroupId: null })],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add alternative" }));
    fireEvent.change(screen.getByLabelText("Alternative label"), {
      target: { value: "Protein" },
    });
    chooseCanonicalIngredient("Black pepper");
    expect(screen.getByLabelText("Alternative options cannot be optional")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Create alternative" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(submittedBody()).toMatchObject({
      expectedVersion: 1,
      action: {
        type: "createGroup",
        ingredientId: lineId,
        label: "Protein",
        option: {
          ingredientSource: "canonical",
          ingredientId: pepperId,
          isOptional: false,
        },
      },
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps other sections visible when deleting a line and offers explicit section disposition", async () => {
    const first = makeLine({ sectionId: firstSectionId, choiceGroupId: null });
    const second = makeLine({
      id: secondLineId,
      sectionId: secondSectionId,
      choiceGroupId: null,
      ingredientId: pepperId,
      ingredientName: "Black pepper",
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { version: 2, deletedIngredientId: lineId, ingredientIds: [] },
        }),
        { status: 200 },
      ),
    );
    render(
      <IngredientEditor
        data={{
          ...data,
          sections: [
            { id: firstSectionId, name: "Filling", position: 0 },
            { id: secondSectionId, name: "Seasoning", position: 1 },
          ],
          choiceGroups: [],
          lines: [first, second],
        }}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete section" })[0]);
    expect(screen.getByLabelText("Move its contents to")).toHaveValue(secondSectionId);
    expect(
      screen.getByRole("button", { name: "Move contents and delete section" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete section and contents" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const saltItem = screen.getByText("Salt").closest("li")!;
    fireEvent.click(within(saltItem).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(saltItem).getAllByRole("button", { name: "Delete" }).at(-1)!);
    await waitFor(() => expect(screen.queryByText("Salt")).not.toBeInTheDocument());
    expect(screen.getByText("Black pepper")).toBeInTheDocument();
  });

  it("announces linked instructions when a destructive change is blocked", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "CONTENT_REFERENCED",
            message:
              "Reassign or delete the linked instruction blocks before changing this ingredient structure.",
            linkedSteps: [{ id: "step", position: 1, instruction: "Cook the tofu." }],
          },
        }),
        { status: 409 },
      ),
    );
    render(
      <IngredientEditor
        data={{
          ...data,
          sections: [{ id: firstSectionId, name: "Filling", position: 0 }],
          choiceGroups: [],
          lines: [makeLine({ sectionId: firstSectionId, choiceGroupId: null })],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Reassign or delete the linked instruction blocks");
    expect(alert).toHaveTextContent("Step 2: Cook the tofu.");
    expect(screen.getByText("Salt")).toBeInTheDocument();
  });
});
