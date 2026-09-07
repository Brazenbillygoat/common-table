import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { listOwnedRecipeDrafts } from "./list-owned-recipe-drafts";

const mocks = vi.hoisted(() => ({
  orderBy: vi.fn(),
  where: vi.fn(),
  select: vi.fn(),
  leftJoin: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({
  getDatabase: () => ({
    select: mocks.select,
  }),
}));
vi.mock("server-only", () => ({}));

describe("listOwnedRecipeDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy });
    mocks.leftJoin.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: () => ({ leftJoin: mocks.leftJoin }) });
  });

  it("returns owned drafts and publications while identifying unpublished changes", async () => {
    const rows = [
      {
        id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        title: "Chili",
        version: 2,
        status: "draft",
        slug: "chili",
        sourceVersion: null,
        updatedAt: new Date(),
      },
      {
        id: "published",
        title: "Soup",
        version: 4,
        status: "published",
        slug: "soup",
        sourceVersion: 3,
        updatedAt: new Date(),
      },
      {
        id: "current",
        title: "Bread",
        version: 5,
        status: "published",
        slug: "bread",
        sourceVersion: 5,
        updatedAt: new Date(),
      },
    ];
    mocks.orderBy.mockResolvedValue(rows);
    await expect(listOwnedRecipeDrafts("trusted-user")).resolves.toEqual(
      rows.map((row, index) => ({ ...row, unpublishedChanges: index === 1 })),
    );
    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.orderBy).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual(["trusted-user", "draft", "published"]);
    expect(query.sql).toContain('"recipes"."owner_id"');
    expect(query.sql).toContain('"recipes"."status" in');
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual([
      "id",
      "title",
      "version",
      "status",
      "slug",
      "sourceVersion",
      "updatedAt",
    ]);
    expect(mocks.leftJoin).toHaveBeenCalledOnce();
    expect(mocks.orderBy.mock.calls[0]).toHaveLength(3);
  });

  it("returns an empty list unchanged", async () => {
    mocks.orderBy.mockResolvedValue([]);
    await expect(listOwnedRecipeDrafts("trusted-user")).resolves.toEqual([]);
  });
});
