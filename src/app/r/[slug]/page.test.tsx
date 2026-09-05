import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PublicRecipePage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({ get: vi.fn(), connection: vi.fn(), content: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/recipes/get-published-recipes", () => ({ getPublishedRecipe: mocks.get }));
vi.mock("@/components/recipes/RecipeCookingContent", () => ({
  RecipeCookingContent: ({ content }: { content: unknown }) => {
    mocks.content(content);
    return <div>Cooking content</div>;
  },
}));

const publication = {
  recipe: {
    id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
    slug: "chili-stable",
    title: "Published chili",
    description: "The published description.",
    yieldMin: 4,
    yieldMax: 6,
    yieldUnit: "servings",
  },
  authorDisplayName: "Hyrum",
  sections: [],
  choiceGroups: [],
  ingredients: [],
  steps: [],
};

const props = () => ({ params: Promise.resolve({ slug: "chili-stable" }) });

describe("Public recipe page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue(publication);
  });

  it("uses only published content for the public body and metadata", async () => {
    expect(await generateMetadata(props())).toEqual({
      title: "Published chili",
      description: "The published description.",
    });
    render(await PublicRecipePage(props()));
    expect(screen.getByRole("heading", { name: "Published chili" })).toBeInTheDocument();
    expect(screen.getByText("The published description.")).toBeInTheDocument();
    expect(screen.getByText("By Hyrum")).toBeInTheDocument();
    expect(screen.getByText("Yield: 4–6 servings")).toBeInTheDocument();
    expect(mocks.content).toHaveBeenCalledWith(publication);
    expect(mocks.get).toHaveBeenCalledWith("chili-stable");
    expect(mocks.connection).toHaveBeenCalled();
  });

  it("omits optional description and yield when absent", async () => {
    mocks.get.mockResolvedValue({
      ...publication,
      recipe: { ...publication.recipe, description: null, yieldMin: null, yieldMax: null },
    });
    render(await PublicRecipePage(props()));
    expect(screen.queryByText(/^Yield:/)).not.toBeInTheDocument();
    expect(screen.queryByText("The published description.")).not.toBeInTheDocument();
    expect(await generateMetadata(props())).toEqual({
      title: "Published chili",
      description: undefined,
    });
  });

  it("rejects unpublished, missing, or invalid publications in the body and metadata", async () => {
    mocks.get.mockResolvedValue(null);
    await expect(PublicRecipePage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.content).not.toHaveBeenCalled();
  });

  it("reads the latest snapshot on a new request", async () => {
    await PublicRecipePage(props());
    mocks.get.mockResolvedValue({
      ...publication,
      recipe: { ...publication.recipe, title: "Published update" },
    });
    render(await PublicRecipePage(props()));
    expect(screen.getByRole("heading", { name: "Published update" })).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
