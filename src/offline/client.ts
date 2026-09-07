import {
  assembleCollection,
  MANIFEST_LIMIT,
  OFFLINE_LIMITS,
  PACKET_LIMIT,
  readBoundedJson,
  validateManifest,
  type OfflineManifest,
} from "@/utils/offline-protocol";
import { allowAppDownload, readOfflineState, removeCollection, replaceCollection } from "./storage";

export const STORAGE_EVENT = "common-table-offline-changed";
const WORKER_PATH = "/offline-sw.js";
const CACHE_PREFIX = "common-table-offline-app-";
export class RevisionConflict extends Error {}
async function request(path: string, options?: RequestInit) {
  return fetch(path, {
    ...options,
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(60_000),
  });
}
let checking: Promise<OfflineManifest> | undefined;
export function checkPublications() {
  checking ??= (async () => {
    const response = await request("/api/offline/publications");
    if (!response.ok)
      throw new Error(
        "Could not check for updates. Try again when connected. The collection may also be unavailable or over the download limits.",
      );
    return validateManifest(await readBoundedJson(response, MANIFEST_LIMIT));
  })().finally(() => {
    checking = undefined;
  });
  return checking;
}
export async function appDownloadEstimate(): Promise<number> {
  const response = await request("/offline-assets.json");
  if (!response.ok) throw new Error("Offline app files are not ready. Try again later.");
  const value = await readBoundedJson(response, MANIFEST_LIMIT);
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes > 25 * 1024 * 1024) {
    throw new Error("Invalid app download estimate.");
  }
  return value.bytes;
}
export async function offlineRegistration() {
  if (!("serviceWorker" in navigator)) return undefined;
  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.find((registration) =>
    [registration.active, registration.waiting, registration.installing].some(
      (worker) => worker && new URL(worker.scriptURL).pathname === WORKER_PATH,
    ),
  );
}
export async function workerMessage<T>(worker: ServiceWorker, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("Offline app did not respond. Retry."));
    }, 10_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}
export async function appIsReady() {
  const registration = await offlineRegistration();
  if (!registration?.active) return false;
  try {
    return (await workerMessage<{ ready: boolean }>(registration.active, "STATUS")).ready;
  } catch {
    return false;
  }
}
async function prepareApp(expectedToken: string | null) {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("indexedDB" in window)) {
    throw new Error(
      "Offline downloads need HTTPS and a browser with service workers and device storage.",
    );
  }
  await allowAppDownload(expectedToken);
  const registration = await navigator.serviceWorker.register(WORKER_PATH, {
    scope: "/",
    updateViaCache: "none",
  });
  // Initial installation activates normally. Updates wait for existing clients;
  // preparing them never reloads cooking or authoring pages.
  const pending = registration.installing;
  if (pending)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.removeEventListener("statechange", changed);
        reject(new Error("App files timed out. Retry the download."));
      }, 65_000);
      function changed() {
        if (["installed", "activated", "redundant"].includes(pending!.state)) {
          clearTimeout(timer);
          pending!.removeEventListener("statechange", changed);
          if (pending!.state === "redundant")
            reject(new Error("App files could not be saved. Free device space and retry."));
          else resolve();
        }
      }
      pending.addEventListener("statechange", changed);
      changed();
    });
  if (!registration.active)
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Offline app is not active yet. Retry.")), 10_000),
      ),
    ]);
  if (!(await appIsReady())) {
    // An evicted cache may leave an otherwise current registration. Refill only
    // after this explicit consent; do not rely on register() to rerun install.
    if (!registration.active) throw new Error("Offline app is not ready. Retry.");
    await workerMessage(registration.active, "PREPARE");
    if (!(await appIsReady())) throw new Error("Offline app files are incomplete. Retry.");
  }
}
function announceStorageChange() {
  window.dispatchEvent(new Event(STORAGE_EVENT));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(STORAGE_EVENT);
    channel.postMessage("changed");
    channel.close();
  }
}
let syncing: Promise<void> | undefined;
export function syncPublications(manifest: OfflineManifest) {
  // Duplicate clicks share one operation; IndexedDB comparison handles other tabs.
  syncing ??= (async () => {
    const state = await readOfflineState();
    await prepareApp(state.token);
    const body = JSON.stringify({
      revision: manifest.revision,
      known:
        state.collection?.manifest.entries.map(({ id, fingerprint }) => ({ id, fingerprint })) ??
        [],
    });
    if (new TextEncoder().encode(body).byteLength > OFFLINE_LIMITS.request)
      throw new Error("Sync request exceeds the download limit.");
    const response = await request("/api/offline/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.status === 409)
      throw new RevisionConflict("Recipes changed while downloading. Review the refreshed offer.");
    if (!response.ok)
      throw new Error(
        "Download failed. Your saved collection has not changed. Retry when connected.",
      );
    const next = await assembleCollection(
      await readBoundedJson(response, PACKET_LIMIT),
      state.collection,
      manifest.revision,
    );
    if (!(await appIsReady()))
      throw new Error("App files were lost. The saved collection has not changed. Retry.");
    await replaceCollection(next, state.token);
    announceStorageChange();
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}
export async function removeOfflineDownloads() {
  await removeCollection();
  const registration = await offlineRegistration();
  if (registration) await registration.unregister();
  for (const name of await caches.keys())
    if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
  announceStorageChange();
}
