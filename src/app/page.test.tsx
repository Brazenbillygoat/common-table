import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRecipeSearch, type SearchParameters } from "@/utils/recipe-search-query";
import Home from "./page";

const mocks = vi.hoisted(() => ({ search: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/recipes/search-published-recipes", () => ({
  searchPublishedRecipes: mocks.search,
}));
const result = (parameters: SearchParameters = {}) => {
  const parsed = parseRecipeSearch(parameters);
  if (!parsed.ok) return parsed;
  return { ok: true, query: parsed.query, total: 0, recipes: [], hasNextPage: false };
};

describe("Browse recipe search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.search.mockImplementation(async (parameters) => result(parameters));
  });
  it("renders published service order, conditional explanations, and ordinary public links", async () => {
    mocks.search.mockResolvedValue({
      ...result(),
      total: 21,
      hasNextPage: true,
      recipes: [
        {
          slug: "chili-stable",
          title: "Published chili",
          description: "A warming bowl.",
          authorDisplayName: "Hyrum",
          explanations: ["Cooking fat: use Olive oil to avoid Salted butter."],
        },
        {
          slug: "soup-stable",
          title: "Published soup",
          description: null,
          authorDisplayName: "Alex",
          explanations: [],
        },
      ],
    });
    render(await Home({ searchParams: Promise.resolve({}) }));
    const entries = screen.getAllByRole("article");
    expect(entries).toHaveLength(2);
    expect(within(entries[0]).getByRole("link", { name: "Published chili" })).toHaveAttribute(
      "href",
      "/r/chili-stable",
    );
    expect(within(entries[0]).getByText("A warming bowl.")).toBeInTheDocument();
    expect(within(entries[0]).getByText("By Hyrum")).toBeInTheDocument();
    expect(
      within(entries[0]).getByText("Cooking fat: use Olive oil to avoid Salted butter."),
    ).toBeInTheDocument();
    expect(within(entries[1]).getByRole("link", { name: "Published soup" })).toHaveAttribute(
      "href",
      "/r/soup-stable",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/?page=2");
    expect(mocks.connection).toHaveBeenCalledOnce();
  });
  it("preserves applied filters, query and sort through both pagination directions", async () => {
    const parameters = {
      q: "stew",
      include: ["chicken", "tofu"],
      exclude: "butter",
      page: "2",
      sort: "newest",
    };
    mocks.search.mockResolvedValue({ ...result(parameters), hasNextPage: true });
    render(await Home({ searchParams: Promise.resolve(parameters) }));
    for (const [label, page] of [
      ["Previous page", null],
      ["Next page", "3"],
    ] as const) {
      const url = new URL(
        screen.getByRole("link", { name: label }).getAttribute("href")!,
        "https://example.invalid",
      );
      expect(url.searchParams.get("q")).toBe("stew");
      expect(url.searchParams.getAll("include")).toEqual(["chicken", "tofu"]);
      expect(url.searchParams.get("exclude")).toBe("butter");
      expect(url.searchParams.get("sort")).toBe("newest");
      expect(url.searchParams.get("page")).toBe(page);
    }
    expect(screen.getByText("Page 2")).toHaveAttribute("aria-current", "page");
  });
  it("shows correction errors and preserves invalid filter input", async () => {
    render(await Home({ searchParams: Promise.resolve({ exclude: "butter,,oil" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Correct your search");
    expect(screen.getByRole("textbox", { name: "Exclude ingredients" })).toHaveValue("butter,,oil");
    expect(screen.queryByText(/No recipes/)).not.toBeInTheDocument();
  });
  it("offers safe fresh retry with unchanged search on read failure", async () => {
    mocks.search.mockRejectedValue(new Error("private database diagnostic"));
    render(await Home({ searchParams: Promise.resolve({ q: "stew", exclude: "butter" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Recipes could not be loaded");
    expect(screen.getByRole("link", { name: "Retry search" })).toHaveAttribute(
      "href",
      "/?q=stew&exclude=butter",
    );
    expect(screen.queryByText(/private database diagnostic|No recipes/)).not.toBeInTheDocument();
  });
  it("retains controls and clear action in empty searches", async () => {
    render(await Home({ searchParams: Promise.resolve({ include: "nowhere" }) }));
    expect(screen.getByText(/No recipes match/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search and filters" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("textbox", { name: "Include ingredients" })).toHaveValue("nowhere");
  });
  it("restores control values when URL state changes and returns through Back", async () => {
    const first = { q: "stew", include: "tofu", exclude: "butter", sort: "relevance" };
    const second = { q: "soup", include: "beans", sort: "newest" };
    const view = render(await Home({ searchParams: Promise.resolve(first) }));
    fireEvent.change(screen.getByRole("textbox", { name: "Include ingredients" }), {
      target: { value: "unsaved" },
    });
    view.rerender(await Home({ searchParams: Promise.resolve(second) }));
    expect(screen.getByRole("searchbox")).toHaveValue("soup");
    expect(screen.getByRole("textbox", { name: "Include ingredients" })).toHaveValue("beans");
    view.rerender(await Home({ searchParams: Promise.resolve(first) }));
    expect(screen.getByRole("searchbox")).toHaveValue("stew");
    expect(screen.getByRole("textbox", { name: "Include ingredients" })).toHaveValue("tofu");
    expect(screen.getByRole("textbox", { name: "Exclude ingredients" })).toHaveValue("butter");
    expect(screen.getByRole("combobox")).toHaveValue("relevance");
  });
});
