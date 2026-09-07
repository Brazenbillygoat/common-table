import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DetailsPage from "./page";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), read: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/server/recipes/get-owned-recipe-details", () => ({ getOwnedRecipeDetails: mocks.read }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("./DetailsEditor", () => ({
  DetailsEditor: ({ recipe }: { recipe: { title: string } }) => <p>{recipe.title}</p>,
}));
const id = "34053bb6-c957-4d2d-a621-b2e34b774a1d";

describe("DetailsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue({ user: { id: "trusted-owner" } });
  });
  it("loads the draft using the server-derived owner", async () => {
    mocks.read.mockResolvedValue({ id, title: "Saved title" });
    render(await DetailsPage({ params: Promise.resolve({ id }) }));
    expect(mocks.read).toHaveBeenCalledWith(id, "trusted-owner");
    expect(screen.getByText("Saved title")).toBeInTheDocument();
  });
  it("returns unavailable for invalid IDs without reading recipe data", async () => {
    await expect(DetailsPage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns unavailable when the owner-scoped read has no draft", async () => {
    mocks.read.mockResolvedValue(null);
    await expect(DetailsPage({ params: Promise.resolve({ id }) })).rejects.toThrow("NOT_FOUND");
  });
  it("requires authentication before fetching details", async () => {
    mocks.requireUser.mockRejectedValue(new Error("SIGN_IN"));
    await expect(DetailsPage({ params: Promise.resolve({ id }) })).rejects.toThrow("SIGN_IN");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
