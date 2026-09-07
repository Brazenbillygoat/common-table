import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = process.env.OFFLINE_TEST_DIST_DIR || ".next";
const html = await readFile(`${dist}/server/app/offline.html`);
const text = html.toString();
const urls = new Set(["/offline"]);
for (const match of text.matchAll(/\/_next\/static\/[^"'\\\s<>?]+/g)) urls.add(match[0]);
const assets = [];
for (const url of urls) {
  const file =
    url === "/offline" ? html : await readFile(resolve(dist, url.replace("/_next/", "")));
  assets.push({
    url,
    bytes: file.byteLength,
    sha256: createHash("sha256").update(file).digest("hex"),
  });
  if (/\.(js|css)$/.test(url)) {
    // Include lazy chunk references and fonts used by the shell, without caching
    // server responses, authoring HTML, sessions or any recipe data in CacheStorage.
    for (const match of file
      .toString()
      .matchAll(
        /(?:\/_next\/)?static\/(?:chunks|media)\/[a-zA-Z0-9_.~/%+-]+\.(?:js|css|woff2?)/g,
      )) {
      urls.add(match[0].startsWith("/_next/") ? match[0] : `/_next/${match[0]}`);
    }
  }
}
if (
  assets.length < 3 ||
  assets.some(
    (asset) => !["/offline"].includes(asset.url) && !asset.url.startsWith("/_next/static/"),
  )
)
  throw new Error("Offline shell asset discovery failed.");
const source = await readFile("src/offline/worker.js", "utf8");
const bytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
if (bytes > 25 * 1024 * 1024) throw new Error("Offline app exceeds its 25 MiB file budget.");
const version = createHash("sha256").update(JSON.stringify(assets)).update(source).digest("hex");
await mkdir("public", { recursive: true });
await writeFile(
  "public/offline-sw.js",
  source.replace("/* OFFLINE_BUILD */ null", JSON.stringify({ version, assets })),
);
await writeFile("public/offline-assets.json", JSON.stringify({ version, bytes }));
console.log(
  `Offline anonymous shell: ${assets.length} files, ${bytes} bytes, version ${version.slice(0, 12)}.`,
);
