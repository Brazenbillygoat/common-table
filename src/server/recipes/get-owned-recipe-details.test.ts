import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnedRecipeDetails } from "./get-owned-recipe-details";

const mocks = vi.hoisted(() => ({ select: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  getDatabase: () => ({ select: mocks.select }),
}));

describe("getOwnedRecipeDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: mocks.limit }) }),
    });
  });

  it("returns only editable details and the save counter", async () => {
    const recipe = {
      id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
      title: "Chili",
      description: null,
      yieldMin: 4,
      yieldMax: 8,
      yieldUnit: "servings",
      version: 2,
    };
    mocks.limit.mockResolvedValue([recipe]);
    await expect(getOwnedRecipeDetails(recipe.id, "owner")).resolves.toEqual(recipe);
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(Object.keys(recipe));
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });

  it("returns null for unavailable drafts and rejects malformed IDs before database access", async () => {
    mocks.limit.mockResolvedValue([]);
    await expect(
      getOwnedRecipeDetails("34053bb6-c957-4d2d-a621-b2e34b774a1d", "other-owner"),
    ).resolves.toBeNull();
    mocks.select.mockClear();
    await expect(getOwnedRecipeDetails("bad-id", "owner")).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
