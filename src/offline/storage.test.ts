// @vitest-environment node
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchSnapshot } from "@/utils/recipe-search.test-fixtures";
import { assembleCollection, createManifest } from "@/utils/offline-protocol";
import {
  allowAppDownload,
  readCollection,
  readOfflineState,
  removeCollection,
  replaceCollection,
} from "./storage";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function collection(title: string) {
  const snapshot = searchSnapshot();
  snapshot.recipe.title = title;
  const recipes = [{ snapshot, publishedAt: "2026-09-06T12:00:00.000Z" }];
  const manifest = await createManifest(recipes);
  return assembleCollection({ manifest, recipes }, null, manifest.revision);
}
describe("atomic device collection", () => {
  it("commits a complete collection and rejects stale concurrent writers", async () => {
    const first = await collection("First");
    await replaceCollection(first, null);
    const second = await collection("Second");
    await replaceCollection(second, first.token);
    await expect(replaceCollection(await collection("Stale"), first.token)).rejects.toThrow(
      "another page",
    );
    expect(await readCollection()).toEqual(second);
  });
  it("preserves the complete prior copy when a storage write throws or aborts", async () => {
    const first = await collection("First");
    await replaceCollection(first, null);
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    await expect(replaceCollection(await collection("Second"), first.token)).rejects.toThrow(
      "device space",
    );
    spy.mockRestore();
    expect(await readCollection()).toEqual(first);
  });
  it("removal invalidates even a first-time download already running in another page", async () => {
    await removeCollection();
    await expect(allowAppDownload(null)).rejects.toThrow("another page");
    await expect(replaceCollection(await collection("Late"), null)).rejects.toThrow("another page");
    expect(await readCollection()).toBeNull();
    const state = await readOfflineState();
    await replaceCollection(await collection("Explicit retry"), state.token);
    expect((await readCollection())?.recipes[0].snapshot.recipe.title).toBe("Explicit retry");
  });
});
