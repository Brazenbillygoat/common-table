import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const mocks = vi.hoisted(() => ({ list: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/server/recipes/get-published-recipes", () => ({ listPublishedRecipes: mocks.list }));

describe("Browse recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.list.mockResolvedValue({ recipes: [], page: 1, hasNextPage: false });
  });

  it("renders published values in service order and links to stable public URLs", async () => {
    mocks.list.mockResolvedValue({
      recipes: [
        {
          slug: "chili-stable",
          title: "Published chili",
          description: "A warming bowl.",
          authorDisplayName: "Hyrum",
          publishedAt: new Date(),
        },
        {
          slug: "soup-stable",
          title: "Published soup",
          description: null,
          authorDisplayName: "Alex",
          publishedAt: new Date(),
        },
      ],
      page: 1,
      hasNextPage: true,
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
    expect(within(entries[1]).getByRole("link", { name: "Published soup" })).toHaveAttribute(
      "href",
      "/r/soup-stable",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/?page=2");
    expect(screen.queryByRole("link", { name: "Previous page" })).not.toBeInTheDocument();
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledWith(1);
  });

  it("requests the page from the URL and renders previous and next navigation", async () => {
    mocks.list.mockResolvedValue({ recipes: [], page: 2, hasNextPage: true });
    render(await Home({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(mocks.list).toHaveBeenCalledWith(2);
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", "/?page=3");
    expect(screen.getByText("Page 2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("No recipes on this page.")).toBeInTheDocument();
  });

  it.each(["0", "-1", "2.5", "2junk", "9007199254740992", ["2", "3"]])(
    "defaults invalid page %j to the first page",
    async (page) => {
      await Home({ searchParams: Promise.resolve({ page }) });
      expect(mocks.list).toHaveBeenCalledWith(1);
    },
  );

  it("shows a clear empty state without unnecessary pagination", async () => {
    render(await Home({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("No recipes have been published yet.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Recipe pages" })).not.toBeInTheDocument();
  });
});
