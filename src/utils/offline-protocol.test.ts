// @vitest-environment node
import { describe, expect, it } from "vitest";
import { searchSnapshot } from "./recipe-search.test-fixtures";
import {
  assembleCollection,
  canonicalJson,
  createManifest,
  OFFLINE_LIMITS,
  readBoundedJson,
  syncDifference,
  validateManifest,
} from "./offline-protocol";

const saved = (title = "Family stew") => {
  const snapshot = searchSnapshot();
  snapshot.recipe.title = title;
  return { snapshot, publishedAt: "2026-09-06T12:00:00.000Z" };
};
describe("offline publication protocol", () => {
  it("fingerprints JSONB independent of key order and distinguishes real emptiness", async () => {
    expect(canonicalJson({ b: 2, a: [1, 2] })).toBe(canonicalJson({ a: [1, 2], b: 2 }));
    const manifest = await createManifest([]);
    expect(
      (await assembleCollection({ manifest, recipes: [] }, null, manifest.revision)).recipes,
    ).toEqual([]);
    await expect(assembleCollection({ manifest, recipes: [] }, null, "bad")).rejects.toThrow();
  });
  it("supports unchanged deltas, replacements and removals without changing the prior collection", async () => {
    const recipes = [saved()];
    const manifest = await createManifest(recipes);
    const old = await assembleCollection({ manifest, recipes }, null, manifest.revision);
    const same = await assembleCollection({ manifest, recipes: [] }, old, manifest.revision);
    expect(same.recipes).toEqual(old.recipes);
    expect(syncDifference(manifest, old)).toEqual({ added: 0, changed: 0, removed: 0, bytes: 0 });
    const changed = [saved("Changed stew")];
    const updated = await createManifest(changed);
    expect(syncDifference(updated, old).changed).toBe(1);
    await expect(
      assembleCollection({ manifest: updated, recipes: [] }, old, updated.revision),
    ).rejects.toThrow();
    expect(
      (await assembleCollection({ manifest: updated, recipes: changed }, old, updated.revision))
        .recipes[0].snapshot.recipe.title,
    ).toBe("Changed stew");
    const empty = await createManifest([]);
    expect(syncDifference(empty, old).removed).toBe(1);
    expect(
      (await assembleCollection({ manifest: empty, recipes: [] }, old, empty.revision)).recipes,
    ).toHaveLength(0);
    expect(old.recipes[0].snapshot.recipe.title).toBe("Family stew");
  });
  it("rejects mixed revisions, duplicates, missing recipes, incompatible formats and private fields", async () => {
    const recipes = [saved()];
    const manifest = await createManifest(recipes);
    for (const packet of [
      { manifest, recipes: [] },
      { manifest, recipes: [...recipes, ...recipes] },
      { manifest: { ...manifest, format: 9 }, recipes },
      { manifest, recipes: [{ ...recipes[0], email: "private@example.invalid" }] },
      {
        manifest,
        recipes: [{ ...recipes[0], snapshot: { ...recipes[0].snapshot, ownerId: "private" } }],
      },
      { manifest, recipes: [saved("A different revision")] },
    ])
      await expect(assembleCollection(packet, null, manifest.revision)).rejects.toThrow();
  });
  it("bounds collection count, total JSON, and streaming bodies without trusting content-length", async () => {
    const manifest = await createManifest([saved()]);
    await expect(
      validateManifest({ ...manifest, entries: Array(1001).fill(manifest.entries[0]) }),
    ).rejects.toThrow();
    await expect(
      validateManifest({
        ...manifest,
        entries: [{ ...manifest.entries[0], bytes: OFFLINE_LIMITS.data + 1 }],
      }),
    ).rejects.toThrow();
    await expect(
      readBoundedJson(
        new Response(' { "ok": true } ', { headers: { "Content-Type": "application/json" } }),
        5,
      ),
    ).rejects.toThrow("limit");
    await expect(
      readBoundedJson(
        new Response("oops", { headers: { "Content-Type": "application/json" } }),
        50,
      ),
    ).rejects.toThrow();
    await expect(readBoundedJson(new Response("{}"), 50)).rejects.toThrow("JSON");
  });
});
