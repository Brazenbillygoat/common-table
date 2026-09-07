import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchSnapshot } from "@/utils/recipe-search.test-fixtures";

const mocks = vi.hoisted(() => ({ database: vi.fn(), rows: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ getDatabase: mocks.database }));
import { searchPublishedRecipes } from "./search-published-recipes";

describe("published recipe search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database.mockReturnValue({
      select: () => ({ from: () => ({ innerJoin: () => ({ where: mocks.rows }) }) }),
    });
    mocks.rows.mockResolvedValue([]);
  });
  it("rejects invalid filters before reading data", async () => {
    expect(await searchPublishedRecipes({ exclude: "butter,,oil" })).toMatchObject({ ok: false });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it("fails closed for unsupported, invalid and mismatched snapshots without consuming page slots", async () => {
    const snapshot = searchSnapshot();
    const row = {
      recipeId: snapshot.recipe.id,
      slug: snapshot.recipe.slug,
      snapshot,
      formatVersion: 1,
      publishedAt: new Date(),
    };
    mocks.rows.mockResolvedValue([
      { ...row, formatVersion: 999 },
      { ...row, snapshot: { ...snapshot, steps: [] } },
      { ...row, recipeId: "wrong" },
      { ...row, slug: "wrong" },
      row,
    ]);
    const result = await searchPublishedRecipes({ include: "tofu", exclude: "butter" });
    expect(result).toMatchObject({
      ok: true,
      total: 1,
      recipes: [
        {
          title: "Family stew",
          explanations: [
            "Omit optional Peanut butter.",
            "Cooking fat: use Olive oil to avoid Salted butter.",
          ],
        },
      ],
    });
    if (!result.ok) throw new Error("Expected valid result");
    expect(result.recipes[0]).not.toHaveProperty("snapshot");
    expect(result.recipes[0]).not.toHaveProperty("ingredients");
  });
  it("propagates read failure for safe route retry rather than claiming zero results", async () => {
    mocks.rows.mockRejectedValue(new Error("read failed"));
    await expect(searchPublishedRecipes({})).rejects.toThrow("read failed");
  });
});
