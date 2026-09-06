import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchControls } from "./SearchControls";

describe("recipe search controls", () => {
  it("submits the entered state through a fresh GET only when Search is pressed, resetting pagination", () => {
    render(
      <SearchControls
        parameters={{
          q: "stew",
          include: ["chicken", "tofu"],
          exclude: "butter",
          sort: "relevance",
          page: "3",
        }}
      />,
    );
    const form = screen.getByRole("search") as HTMLFormElement;
    expect(form).toHaveAttribute("action", "/");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "beans" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "newest" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove include chicken" }));
    expect(screen.getByRole("textbox", { name: "Include ingredients" })).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Remove include chicken" }),
    ).not.toBeInTheDocument();
    const submitted = new FormData(form);
    expect(submitted.get("q")).toBe("beans");
    expect(String(submitted.get("include")).trim()).toBe("tofu");
    expect(submitted.get("exclude")).toBe("butter");
    expect(submitted.get("sort")).toBe("newest");
    expect(submitted.has("page")).toBe(false);
  });
  it("visibly explains partial matching and mutually exclusive included alternatives", () => {
    render(<SearchControls parameters={{}} />);
    expect(screen.getByText(/Ingredient filters match text anywhere/)).toHaveTextContent(
      "'Butter' matches both 'salted butter' and 'peanut butter,' for inclusion and exclusion. Included ingredients may be alternatives.",
    );
    expect(screen.getByRole("combobox")).toHaveValue("newest");
    expect(screen.getByText(/Press Search to apply/)).toBeVisible();
  });
  it("removes an excluded pill without losing other entered filters", () => {
    render(<SearchControls parameters={{ include: "tofu", exclude: "butter, oil" }} />);
    const button = screen.getByRole("button", { name: "Remove exclude butter" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(screen.getByRole("textbox", { name: "Exclude ingredients" })).toHaveValue(" oil");
    expect(screen.getByRole("textbox", { name: "Include ingredients" })).toHaveValue("tofu");
  });
});
