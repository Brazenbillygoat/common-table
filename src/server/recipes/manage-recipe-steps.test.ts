import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRecipeStep,
  deleteRecipeStep,
  RecipeStepError,
  reorderRecipeSteps,
  updateRecipeStep,
} from "./manage-recipe-steps";

const mocks = vi.hoisted(() => ({
  database: { transaction: vi.fn() },
}));
vi.mock("@/server/db/client", () => ({ getDatabase: () => mocks.database }));
vi.mock("server-only", () => ({}));

type MockTransaction = ReturnType<typeof transaction>;

function transaction() {
  return {
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
  };
}

function returningUpdate(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
    }),
  };
}

function selectWhere(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function selectOrder(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(rows) }),
    }),
  };
}

function selectLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
    }),
  };
}

function returningDelete(rows: unknown[]) {
  return {
    where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }),
  };
}

function positionUpdate() {
  return {
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };
}

describe("manage recipe steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates at the next position after advancing the owned draft version", async () => {
    const step = {
      id: "e785b35e-4ff4-421b-9609-58b889461279",
      position: 3,
      instruction: "Stir.",
    };
    const tx = transaction();
    tx.update.mockReturnValueOnce(returningUpdate([{ version: 2 }]));
    tx.select.mockReturnValueOnce(selectWhere([{ maximum: 2 }]));
    const values = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([step]) });
    tx.insert.mockReturnValue({ values });
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );

    await expect(
      createRecipeStep({
        actorUserId: "trusted-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        expectedVersion: 1,
        input: { instruction: "Stir." },
      }),
    ).resolves.toEqual({ step, version: 2 });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ position: 3, instruction: "Stir." }),
    );
    expect(tx.update).toHaveBeenCalledOnce();
  });

  it("classifies an owned stale draft as a version conflict without a step mutation", async () => {
    const tx = transaction();
    tx.update.mockReturnValueOnce(returningUpdate([]));
    tx.select.mockReturnValueOnce(selectLimit([{ id: "recipe-id" }]));
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );
    await expect(
      createRecipeStep({
        actorUserId: "trusted-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        expectedVersion: 1,
        input: { instruction: "Stir." },
      }),
    ).rejects.toEqual(new RecipeStepError("VERSION_CONFLICT"));
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("classifies another user's or nondraft recipe as unavailable", async () => {
    const tx = transaction();
    tx.update.mockReturnValueOnce(returningUpdate([]));
    tx.select.mockReturnValueOnce(selectLimit([]));
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );
    await expect(
      createRecipeStep({
        actorUserId: "other-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        expectedVersion: 1,
        input: { instruction: "Stir." },
      }),
    ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
  });

  it("rejects a missing update target after version advancement", async () => {
    const tx = transaction();
    tx.update
      .mockReturnValueOnce(returningUpdate([{ version: 3 }]))
      .mockReturnValueOnce(returningUpdate([]));
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );
    await expect(
      updateRecipeStep({
        actorUserId: "trusted-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        stepId: "e785b35e-4ff4-421b-9609-58b889461279",
        expectedVersion: 2,
        input: { instruction: "Bake." },
      }),
    ).rejects.toMatchObject({ code: "RECIPE_NOT_FOUND" });
    expect(mocks.database.transaction).toHaveBeenCalledOnce();
  });

  it("deletes a step and compacts the remaining positions", async () => {
    const deletedId = "e785b35e-4ff4-421b-9609-58b889461279";
    const remainingId = "c62ec57a-7ef4-470c-ae03-10a74b8aabf2";
    const tx = transaction();
    tx.update.mockReturnValueOnce(returningUpdate([{ version: 4 }]));
    tx.update.mockReturnValueOnce(positionUpdate());
    tx.delete.mockReturnValueOnce(returningDelete([{ id: deletedId }]));
    tx.select.mockReturnValueOnce(selectOrder([{ id: remainingId, position: 1 }]));
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );

    await expect(
      deleteRecipeStep({
        actorUserId: "trusted-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        stepId: deletedId,
        expectedVersion: 3,
      }),
    ).resolves.toEqual({
      deletedStepId: deletedId,
      stepIds: [remainingId],
      version: 4,
    });
    expect(tx.update).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      caseName: "a missing ID",
      stepIds: ["e785b35e-4ff4-421b-9609-58b889461279"],
    },
    {
      caseName: "an extra ID",
      stepIds: [
        "e785b35e-4ff4-421b-9609-58b889461279",
        "c62ec57a-7ef4-470c-ae03-10a74b8aabf2",
        "f4275994-4004-448f-b1fd-0d64f3f8ee65",
      ],
    },
    {
      caseName: "a foreign ID",
      stepIds: ["e785b35e-4ff4-421b-9609-58b889461279", "f4275994-4004-448f-b1fd-0d64f3f8ee65"],
    },
    {
      caseName: "a duplicate ID",
      stepIds: ["e785b35e-4ff4-421b-9609-58b889461279", "e785b35e-4ff4-421b-9609-58b889461279"],
    },
  ])("rejects a reorder containing $caseName", async ({ stepIds }) => {
    const tx = transaction();
    tx.update.mockReturnValueOnce(returningUpdate([{ version: 4 }]));
    tx.select.mockReturnValueOnce(
      selectOrder([
        { id: "e785b35e-4ff4-421b-9609-58b889461279", position: 0 },
        { id: "c62ec57a-7ef4-470c-ae03-10a74b8aabf2", position: 1 },
      ]),
    );
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );

    await expect(
      reorderRecipeSteps({
        actorUserId: "trusted-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        expectedVersion: 3,
        stepIds,
      }),
    ).rejects.toMatchObject({ code: "STEP_SET_INVALID" });
    expect(tx.update).toHaveBeenCalledOnce();
  });

  it("moves all positions aside before assigning the complete saved order", async () => {
    const firstId = "e785b35e-4ff4-421b-9609-58b889461279";
    const secondId = "c62ec57a-7ef4-470c-ae03-10a74b8aabf2";
    const tx = transaction();
    tx.update
      .mockReturnValueOnce(returningUpdate([{ version: 4 }]))
      .mockReturnValueOnce({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      })
      .mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      });
    tx.select.mockReturnValueOnce(
      selectOrder([
        { id: firstId, position: 0 },
        { id: secondId, position: 1 },
      ]),
    );
    mocks.database.transaction.mockImplementation(
      async (callback: (transaction: MockTransaction) => Promise<unknown>) => callback(tx),
    );
    await expect(
      reorderRecipeSteps({
        actorUserId: "trusted-user",
        recipeId: "34053bb6-c957-4d2d-a621-b2e34b774a1d",
        expectedVersion: 3,
        stepIds: [secondId, firstId],
      }),
    ).resolves.toEqual({ stepIds: [secondId, firstId], version: 4 });
    expect(tx.update).toHaveBeenCalledTimes(4);
  });
});
