import { beforeEach, describe, expect, it, vi } from "vitest";

import { listOwnedRecipeDrafts } from "./list-owned-recipe-drafts";

const mocks = vi.hoisted(() => ({
  orderBy: vi.fn(),
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

describe("listOwnedRecipeDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
  });

  it("returns safe owned draft fields in database order", async () => {
    const rows = [
      {
        id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        title: "Chili",
        version: 2,
        updatedAt: new Date(),
      },
    ];
    mocks.orderBy.mockResolvedValue(rows);
    await expect(listOwnedRecipeDrafts("trusted-user")).resolves.toEqual(rows);
    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.orderBy).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list unchanged", async () => {
    mocks.orderBy.mockResolvedValue([]);
    await expect(listOwnedRecipeDrafts("trusted-user")).resolves.toEqual([]);
  });
});
