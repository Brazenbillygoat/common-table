import { assembleCollection, type OfflineCollection } from "@/utils/offline-protocol";

export const DATABASE_NAME = "common-table-offline";
const STORE = "collection";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
      request.result.createObjectStore("settings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other Common Table pages and retry."));
  });
}
export async function readOfflineState(): Promise<{
  collection: OfflineCollection | null;
  token: string | null;
}> {
  const db = await openDatabase();
  try {
    const stored = await new Promise<
      OfflineCollection | { removed: true; token: string } | undefined
    >((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get("current");
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    if (!stored || "removed" in stored) return { collection: null, token: stored?.token ?? null };
    // Validate persisted data too: eviction/corruption or a future format must
    // never look like a valid empty collection or be silently overwritten.
    await assembleCollection(
      { manifest: stored.manifest, recipes: stored.recipes },
      null,
      stored.manifest.revision,
    );
    if (!Number.isFinite(Date.parse(stored.syncedAt)) || typeof stored.token !== "string")
      throw new Error("Invalid saved collection.");
    return { collection: stored, token: stored.token };
  } finally {
    db.close();
  }
}
export async function readCollection() {
  return (await readOfflineState()).collection;
}
export async function allowAppDownload(expectedToken: string | null) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, "settings"], "readwrite");
      const current = tx.objectStore(STORE).get("current");
      current.onsuccess = () => {
        if ((current.result?.token ?? null) !== expectedToken) {
          tx.abort();
          return;
        }
        const settings = tx.objectStore("settings");
        const read = settings.get("consent");
        read.onsuccess = () => {
          if (!read.result) settings.put(crypto.randomUUID(), "consent");
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error("Offline setup changed in another page. Check again."));
    });
  } finally {
    db.close();
  }
}
export async function replaceCollection(next: OfflineCollection, expectedToken: string | null) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get("current");
      let conflict = false;
      request.onsuccess = () => {
        if ((request.result?.token ?? null) !== expectedToken) {
          conflict = true;
          tx.abort();
        } else {
          try {
            store.put(next, "current");
          } catch {
            tx.abort();
          }
        }
      };
      // The request succeeding is insufficient: quota errors may abort commit.
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          new Error(
            conflict
              ? "Offline storage changed in another page. Check again."
              : "Could not save the download. Free device space and retry.",
          ),
        );
      tx.onerror = () => {};
    });
  } finally {
    db.close();
  }
}
export async function removeCollection() {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, "settings"], "readwrite");
      // A tombstone invalidates an in-flight first sync in another tab too.
      tx.objectStore(STORE).put({ removed: true, token: crypto.randomUUID() }, "current");
      tx.objectStore("settings").delete("consent");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
