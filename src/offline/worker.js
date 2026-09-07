/* This source is filled with the exact build manifest by build-offline.mjs. */
const BUILD = /* OFFLINE_BUILD */ null;
const PREFIX = "common-table-offline-app-";
const CACHE = PREFIX + BUILD.version;
const paths = new Set(BUILD.assets.map((asset) => asset.url));
const consent = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open("common-table-offline", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("collection");
      request.result.createObjectStore("settings");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("settings", "readonly");
      const read = tx.objectStore("settings").get("consent");
      tx.oncomplete = () => {
        db.close();
        resolve(read.result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
let preparing;
function prepare() {
  preparing ??= (async () => {
    const token = await consent();
    if (!token) throw new Error("Choose Download now before downloading app files.");
    const cache = await caches.open(CACHE);
    try {
      // Never overwrite a complete version during recovery. Only missing files
      // are fetched; every response must match the build's byte count and hash.
      for (const asset of BUILD.assets) {
        if (await cache.match(asset.url)) continue;
        const response = await fetch(asset.url, {
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok || response.headers.has("set-cookie"))
          throw new Error("Offline app file unavailable.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== asset.bytes || (await digest(bytes)) !== asset.sha256)
          throw new Error("App version changed during download. Retry.");
        await cache.put(
          asset.url,
          new Response(bytes, {
            headers: {
              "Content-Type": response.headers.get("content-type") || "application/octet-stream",
            },
          }),
        );
      }
      if ((await consent()) !== token)
        throw new Error("Offline download was removed in another page.");
    } catch (error) {
      // An incomplete NEW version cannot invalidate the active old version.
      // Missing files remain missing if repair fails; the UI never claims ready.
      if (!(await consent()) || self.registration.active?.scriptURL !== self.location.href)
        await caches.delete(CACHE);
      throw error;
    }
  })().finally(() => {
    preparing = undefined;
  });
  return preparing;
}
async function ready() {
  if (!(await consent())) return false;
  const cache = await caches.open(CACHE);
  return (await Promise.all(BUILD.assets.map((asset) => cache.match(asset.url)))).every(Boolean);
}
self.addEventListener("install", (event) => {
  event.waitUntil(prepare());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Normal lifecycle waits for old clients to close. Conservatively retain old
      // assets if any window still exists, including an uncontrolled editor.
      if (!(await self.clients.matchAll({ type: "window", includeUncontrolled: true })).length) {
        for (const name of await caches.keys())
          if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (!event.source || !event.ports[0]) return;
  event.waitUntil(
    (async () => {
      try {
        if (event.data?.type === "PREPARE") {
          await prepare();
          event.ports[0].postMessage({ ready: await ready() });
        } else if (event.data?.type === "STATUS")
          event.ports[0].postMessage({ ready: await ready(), version: BUILD.version });
      } catch {
        event.ports[0].postMessage({
          error:
            "Offline app files could not be prepared. Reconnect and retry; your saved recipes are kept.",
        });
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (paths.has(url.pathname) && url.pathname !== "/offline" && !url.search) {
    event.respondWith(
      (async () =>
        (await caches.open(CACHE))
          .match(url.pathname)
          .then((cached) => cached || fetch(request)))(),
    );
    return;
  }
  const publicPage =
    url.pathname === "/" ||
    url.pathname === "/search" ||
    url.pathname === "/offline" ||
    /^\/r\/[^/]+\/?$/.test(url.pathname);
  if (request.mode !== "navigate" || !publicPage) return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
      } catch {
        /* Fall back only for public document navigation. */
      }
      if (await ready()) {
        const shell = await (await caches.open(CACHE)).match("/offline");
        if (shell) return shell;
      }
      return new Response(
        "Offline app files are unavailable. Reconnect and choose Download now in Common Table.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    })(),
  );
});
