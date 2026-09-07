import { z } from "zod";
import { publishedRecipeSnapshotSchema } from "./recipe-publication";

export const OFFLINE_FORMAT = 1;
export const OFFLINE_LIMITS = { recipes: 1_000, data: 20 * 1024 * 1024, request: 256 * 1024 };
export const MANIFEST_LIMIT = 512 * 1024;
export const PACKET_LIMIT = OFFLINE_LIMITS.data + MANIFEST_LIMIT;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const slug = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const entrySchema = z.strictObject({
  id: z.uuid(),
  slug,
  fingerprint: digest,
  bytes: z.number().int().positive().max(OFFLINE_LIMITS.data),
});
export const manifestSchema = z.strictObject({
  format: z.literal(OFFLINE_FORMAT),
  revision: digest,
  entries: z.array(entrySchema).max(OFFLINE_LIMITS.recipes),
});
export const savedRecipeSchema = z.strictObject({
  snapshot: publishedRecipeSnapshotSchema,
  publishedAt: z.iso.datetime(),
});
export const syncRequestSchema = z
  .strictObject({
    revision: digest,
    known: z
      .array(z.strictObject({ id: z.uuid(), fingerprint: digest }))
      .max(OFFLINE_LIMITS.recipes),
  })
  .refine((value) => new Set(value.known.map((item) => item.id)).size === value.known.length);
export const packetSchema = z.strictObject({
  manifest: manifestSchema,
  recipes: z.array(savedRecipeSchema).max(OFFLINE_LIMITS.recipes),
});
export type OfflineManifest = z.infer<typeof manifestSchema>;
export type SavedRecipe = z.infer<typeof savedRecipeSchema>;
export type OfflineCollection = {
  manifest: OfflineManifest;
  recipes: SavedRecipe[];
  syncedAt: string;
  token: string;
};

// JSONB does not preserve key order. Fingerprints must be identical on both sides.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;
export async function fingerprint(value: unknown) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function describeRecipe(recipe: SavedRecipe) {
  return {
    id: recipe.snapshot.recipe.id,
    slug: recipe.snapshot.recipe.slug,
    fingerprint: await fingerprint(recipe),
    bytes: byteLength(canonicalJson(recipe)),
  };
}
export async function createManifest(recipes: SavedRecipe[]): Promise<OfflineManifest> {
  const entries = await Promise.all(recipes.map(describeRecipe));
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const manifest = { format: OFFLINE_FORMAT, revision: await fingerprint(entries), entries };
  return validateManifest(manifest);
}
export async function validateManifest(value: unknown) {
  const manifest = manifestSchema.parse(value);
  if (
    new Set(manifest.entries.map((entry) => entry.id)).size !== manifest.entries.length ||
    new Set(manifest.entries.map((entry) => entry.slug)).size !== manifest.entries.length ||
    manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0) +
      2 +
      Math.max(0, manifest.entries.length - 1) >
      OFFLINE_LIMITS.data ||
    manifest.entries.some(
      (entry, index) => index > 0 && manifest.entries[index - 1].id.localeCompare(entry.id) >= 0,
    ) ||
    (await fingerprint(manifest.entries)) !== manifest.revision
  ) {
    throw new Error("Invalid or oversized offline collection. The saved copy has not changed.");
  }
  return manifest;
}

// Unchanged entries must exist locally; changed entries must match their exact
// fingerprints. Missing, extra, duplicate, mixed-revision and private data fail closed.
export async function assembleCollection(
  value: unknown,
  previous: OfflineCollection | null,
  revision: string,
) {
  const packet = packetSchema.parse(value);
  const manifest = await validateManifest(packet.manifest);
  if (manifest.revision !== revision) throw new Error("The publication revision changed.");
  const changed = new Map<string, SavedRecipe>();
  const expected = new Map(manifest.entries.map((entry) => [entry.id, entry]));
  for (const item of packet.recipes) {
    const id = item.snapshot.recipe.id;
    if (!expected.has(id) || changed.has(id)) throw new Error("Unexpected recipe in download.");
    changed.set(id, item);
  }
  const prior = new Map(previous?.recipes.map((item) => [item.snapshot.recipe.id, item]));
  const recipes: SavedRecipe[] = [];
  for (const entry of manifest.entries) {
    const item = changed.get(entry.id) ?? prior.get(entry.id);
    if (!item || canonicalJson(await describeRecipe(item)) !== canonicalJson(entry)) {
      throw new Error("Incomplete or invalid download. The saved copy has not changed.");
    }
    recipes.push(item);
  }
  return { manifest, recipes, syncedAt: new Date().toISOString(), token: crypto.randomUUID() };
}

export async function readBoundedJson(response: Request | Response, limit: number) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Expected a JSON response.");
  }
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Transfer limit exceeded.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new Error("Transfer limit exceeded.");
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function syncDifference(manifest: OfflineManifest, previous: OfflineCollection | null) {
  const known = new Map(previous?.manifest.entries.map((entry) => [entry.id, entry.fingerprint]));
  const added = manifest.entries.filter((entry) => !known.has(entry.id));
  const changed = manifest.entries.filter(
    (entry) => known.has(entry.id) && known.get(entry.id) !== entry.fingerprint,
  );
  return {
    added: added.length,
    changed: changed.length,
    removed:
      previous?.manifest.entries.filter(
        (entry) => !manifest.entries.some((item) => item.id === entry.id),
      ).length ?? 0,
    bytes: [...added, ...changed].reduce((sum, entry) => sum + entry.bytes, 0),
  };
}
