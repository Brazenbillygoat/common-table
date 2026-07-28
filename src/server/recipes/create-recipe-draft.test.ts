import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRecipeDraft, isSlugCollision } from "./create-recipe-draft";

const mocks = vi.hoisted(() => ({
  database: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/server/db/client", () => ({
  getDatabase: () => mocks.database,
}));

vi.mock("server-only", () => ({}));

const input = {
  title: "Family Chili",
  description: null,
  yieldMin: 4,
  yieldMax: null,
  yieldUnit: "servings",
};

function mockSlugRows(rows: { slug: string }[]) {
  mocks.database.select.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  });
}

function transactionWithRecipe(id = "34053bb6-c957-4d2d-a621-b2e34b774a1d") {
  const recipeValues = vi.fn();
  const sectionValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi
    .fn()
    .mockReturnValueOnce({
      values: (values: unknown) => {
        recipeValues(values);
        return {
          returning: async () => [{ id, title: "Family Chili", status: "draft", version: 1 }],
        };
      },
    })
    .mockReturnValueOnce({ values: sectionValues });
  return { insert, recipeValues, sectionValues };
}

type MockTransaction = ReturnType<typeof transactionWithRecipe>;

describe("createRecipeDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlugRows([]);
  });

  it("creates the owned draft and unnamed section in one transaction", async () => {
    const transaction = transactionWithRecipe();
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(transaction),
    );

    const result = await createRecipeDraft({ actorUserId: "trusted-user", input });

    expect(mocks.database.transaction).toHaveBeenCalledOnce();
    expect(transaction.recipeValues).toHaveBeenCalledWith({
      ownerId: "trusted-user",
      slug: "family-chili",
      title: "Family Chili",
      description: null,
      status: "draft",
      yieldMin: 4,
      yieldMax: null,
      yieldUnit: "servings",
      version: 1,
      publishedAt: null,
    });
    expect(transaction.sectionValues).toHaveBeenCalledWith({
      recipeId: result.id,
      name: null,
      position: 0,
    });
    expect(result).toEqual({
      id: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
      title: "Family Chili",
      status: "draft",
      version: 1,
      editUrl: "/recipes/34053bb6-c957-4d2d-a621-b2e34b774a1d/edit/ingredients",
    });
  });

  it("chooses the lowest currently available suffix", async () => {
    mockSlugRows([{ slug: "family-chili" }, { slug: "family-chili-2" }]);
    const transaction = transactionWithRecipe();
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(transaction),
    );

    await createRecipeDraft({ actorUserId: "trusted-user", input });
    expect(transaction.recipeValues).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "family-chili-3" }),
    );
  });

  it("retries a complete transaction only for the slug constraint", async () => {
    const collision = Object.assign(new Error("collision"), {
      code: "23505",
      constraint: "recipes_slug_unique",
    });
    const transaction = transactionWithRecipe();
    mocks.database.transaction
      .mockRejectedValueOnce(collision)
      .mockImplementationOnce(
        async (callback: (transaction: MockTransaction) => Promise<unknown>) =>
          callback(transaction),
      );

    await createRecipeDraft({ actorUserId: "trusted-user", input });
    expect(mocks.database.transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry other unique violations or transaction failures", async () => {
    const error = Object.assign(new Error("other constraint"), {
      code: "23505",
      constraint: "some_other_unique",
    });
    mocks.database.transaction.mockRejectedValue(error);

    await expect(createRecipeDraft({ actorUserId: "trusted-user", input })).rejects.toBe(error);
    expect(mocks.database.transaction).toHaveBeenCalledOnce();
  });

  it("limits slug collision retries to five", async () => {
    const collision = Object.assign(new Error("collision"), {
      code: "23505",
      constraint: "recipes_slug_unique",
    });
    mocks.database.transaction.mockRejectedValue(collision);

    await expect(createRecipeDraft({ actorUserId: "trusted-user", input })).rejects.toBe(collision);
    expect(mocks.database.transaction).toHaveBeenCalledTimes(6);
  });

  it("recognizes a wrapped PostgreSQL slug collision", () => {
    expect(
      isSlugCollision({
        cause: { code: "23505", constraint: "recipes_slug_unique" },
      }),
    ).toBe(true);
  });
});
