import { beforeEach, describe, expect, it, vi } from "vitest";

import { getOwnedRecipe } from "./get-owned-recipe";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: mocks.where,
      }),
    }),
  }),
}));

vi.mock("server-only", () => ({}));

describe("getOwnedRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockReturnValue({ limit: mocks.limit });
  });

  it("returns the minimum owned recipe result", async () => {
    const owned = {
      id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
      title: "Family Chili",
      status: "draft",
      version: 1,
    };
    mocks.limit.mockResolvedValue([owned]);
    await expect(getOwnedRecipe(owned.id, "trusted-user")).resolves.toEqual(owned);
    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });

  it("returns the same null result for missing or unauthorized recipes", async () => {
    mocks.limit.mockResolvedValue([]);
    await expect(
      getOwnedRecipe("34053bb6-c957-4d2d-a621-b2e34b774a1d", "another-user"),
    ).resolves.toBeNull();
  });
});
