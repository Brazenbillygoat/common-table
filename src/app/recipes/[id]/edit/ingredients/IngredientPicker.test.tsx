import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { IngredientPicker } from "./IngredientPicker";

const options = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Black pepper" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Kosher salt" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Salted butter" },
];

function PickerHarness({ initialId = "" }: { initialId?: string }) {
  const initialOption = options.find((option) => option.id === initialId);
  const [query, setQuery] = useState(initialOption?.name ?? "");
  const [selectedId, setSelectedId] = useState(initialId);

  return (
    <>
      <IngredientPicker
        inputId="ingredient-id"
        invalid={false}
        onChooseCustom={vi.fn()}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          if (nextQuery !== options.find((option) => option.id === selectedId)?.name) {
            setSelectedId("");
          }
        }}
        onSelect={(id) => setSelectedId(id)}
        options={options}
        query={query}
        selectedId={selectedId}
      />
      <output data-testid="selected-id">{selectedId}</output>
    </>
  );
}

describe("IngredientPicker", () => {
  it("filters canonical options from user text", () => {
    render(<PickerHarness />);
    const input = screen.getByRole("combobox", { name: "Ingredient" });

    fireEvent.change(input, { target: { value: "salt" } });

    expect(screen.queryByRole("option", { name: "Black pepper" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kosher salt" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Salted butter" })).toBeInTheDocument();
  });

  it("stores the canonical ID and visible name after pointer selection", () => {
    render(<PickerHarness />);
    const input = screen.getByRole("combobox", { name: "Ingredient" });
    fireEvent.focus(input);

    fireEvent.click(screen.getByRole("option", { name: "Kosher salt" }));

    expect(input).toHaveValue("Kosher salt");
    expect(screen.getByTestId("selected-id")).toHaveTextContent(options[1].id);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow-key navigation and Enter selection", () => {
    render(<PickerHarness />);
    const input = screen.getByRole("combobox", { name: "Ingredient" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", `ingredient-id-option-${options[1].id}`);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input).toHaveValue("Kosher salt");
    expect(screen.getByTestId("selected-id")).toHaveTextContent(options[1].id);
  });

  it("closes on Escape and lets Tab proceed without being prevented", () => {
    render(<PickerHarness />);
    const input = screen.getByRole("combobox", { name: "Ingredient" });
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.focus(input);
    const tabResult = fireEvent.keyDown(input, { key: "Tab" });
    expect(tabResult).toBe(true);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("clears a stale canonical ID when the selected query is edited", () => {
    render(<PickerHarness initialId={options[1].id} />);
    const input = screen.getByRole("combobox", { name: "Ingredient" });
    expect(input).toHaveValue("Kosher salt");

    fireEvent.change(input, { target: { value: "Kosher sal" } });

    expect(screen.getByTestId("selected-id")).toBeEmptyDOMElement();
    expect(input).toHaveValue("Kosher sal");
  });

  it("initializes an existing canonical selection", () => {
    render(<PickerHarness initialId={options[0].id} />);

    expect(screen.getByRole("combobox", { name: "Ingredient" })).toHaveValue("Black pepper");
    expect(screen.getByTestId("selected-id")).toHaveTextContent(options[0].id);
  });

  it("links validation messaging to the combobox", () => {
    render(
      <>
        <IngredientPicker
          errorId="ingredient-id-error"
          inputId="ingredient-id"
          invalid
          onChooseCustom={vi.fn()}
          onQueryChange={vi.fn()}
          onSelect={vi.fn()}
          options={options}
          query=""
          selectedId=""
        />
        <p id="ingredient-id-error">Choose an ingredient.</p>
      </>,
    );

    expect(screen.getByRole("combobox", { name: "Ingredient" })).toHaveAccessibleDescription(
      "Choose an ingredient.",
    );
  });
});
