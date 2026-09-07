import { spawn } from "node:child_process";
import { createServer, request as proxyRequest } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";

// This harness is local test infrastructure, never an application route. It
// switches two real production builds behind one origin and injects wire faults.
const database = new URL(process.env.DATABASE_URL || "http://missing.invalid");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  !["postgres:", "postgresql:"].includes(database.protocol)
) {
  throw new Error(
    "Set DATABASE_URL to local fixture-only PostgreSQL before offline e2e tests. Remote databases are forbidden.",
  );
}
const env = {
  ...process.env,
  BETTER_AUTH_URL: "http://localhost:3110",
  BETTER_AUTH_SECRET: "offline-e2e-synthetic-secret-at-least-32-characters",
};
const children = [];
function start(args, extra = {}, output = "inherit") {
  const child = spawn(process.execPath, args, {
    env: { ...env, ...extra },
    stdio: ["ignore", output, output],
    windowsHide: true,
  });
  children.push(child);
  return child;
}
async function run(args, extra) {
  const child = start(args, extra);
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`${args.join(" ")} failed (${code}).`);
}
const artifacts = [];
let version = 0;
let fault = "";
let downloads = [];
let checks = 0;
let disconnected = false;
let server;
const originalTsconfig = await readFile("tsconfig.json");
const originalNextEnv = await readFile("next-env.d.ts").catch(() => null);
try {
  for (let index = 0; index < 2; index++) {
    const dist = `.next-offline-e2e/build-${index}`;
    if (process.env.OFFLINE_E2E_REUSE_BUILDS !== "1") {
      await run(["node_modules/next/dist/bin/next", "build"], { OFFLINE_TEST_DIST_DIR: dist });
      await run(["scripts/build-offline.mjs"], { OFFLINE_TEST_DIST_DIR: dist });
      await writeFile(`${dist}/offline-sw.js`, await readFile("public/offline-sw.js"));
      await writeFile(`${dist}/offline-assets.json`, await readFile("public/offline-assets.json"));
    }
    artifacts.push({
      worker: await readFile(`${dist}/offline-sw.js`),
      manifest: await readFile(`${dist}/offline-assets.json`),
    });
    const child = start(
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(3111 + index),
      ],
      { OFFLINE_TEST_DIST_DIR: dist },
      "pipe",
    );
    let log = "";
    child.stdout.on("data", (data) => {
      log += data;
    });
    child.stderr.on("data", (data) => {
      log += data;
    });
    for (let attempt = 0; ; attempt++) {
      if (child.exitCode !== null) throw new Error(log);
      try {
        if ((await fetch(`http://127.0.0.1:${3111 + index}/offline`)).ok) break;
      } catch {}
      if (attempt >= 100) throw new Error(`Test server did not start: ${log}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (artifacts[0].manifest.equals(artifacts[1].manifest))
    throw new Error("Upgrade test needs two different production builds.");
  server = createServer(async (request, response) => {
    if (request.url === "/__test/control") {
      if (request.method === "POST") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const input = JSON.parse(Buffer.concat(chunks).toString());
        if (input.version !== undefined) version = input.version === 1 ? 1 : 0;
        if (input.fault !== undefined) fault = input.fault;
        if (input.disconnected !== undefined) disconnected = input.disconnected === true;
        if (input.reset) {
          downloads = [];
          checks = 0;
        }
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ version, fault, downloads, checks }));
      return;
    }
    // Windows WebKit's protocol offline switch also disables service-worker
    // navigations. Cutting the app transport tests its real worker/cache path.
    if (disconnected) {
      response.destroy();
      return;
    }
    if (request.url === "/offline-sw.js" || request.url === "/offline-assets.json") {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader(
        "Content-Type",
        request.url.endsWith(".js") ? "application/javascript" : "application/json",
      );
      response.end(
        request.url.endsWith(".js") ? artifacts[version].worker : artifacts[version].manifest,
      );
      return;
    }
    if (fault === "app" && request.url?.startsWith("/_next/static/")) {
      response.writeHead(503);
      response.end();
      return;
    }
    const downloading = request.method === "POST" && request.url === "/api/offline/publications";
    if (request.method === "GET" && request.url === "/api/offline/publications") checks++;
    const upstream = proxyRequest(
      {
        hostname: "127.0.0.1",
        port: 3111 + version,
        path: request.url,
        method: request.method,
        headers: { ...request.headers, "accept-encoding": "identity" },
      },
      (incoming) => {
        if (!downloading) {
          response.writeHead(incoming.statusCode, incoming.headers);
          incoming.pipe(response);
          return;
        }
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("end", () => {
          let body = Buffer.concat(chunks);
          try {
            const data = JSON.parse(body.toString());
            downloads.push(data.recipes?.map((item) => item.snapshot.recipe.id) ?? []);
            if (fault === "invalid" && data.recipes?.length) {
              data.recipes[0].snapshot.email = "private-leak@example.invalid";
              body = Buffer.from(JSON.stringify(data));
            }
          } catch {}
          response.writeHead(incoming.statusCode, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Content-Length": body.length,
          });
          if (fault === "interrupt") {
            response.write(body.subarray(0, 20));
            response.destroy();
          } else response.end(body);
        });
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(503);
      response.end();
    });
    request.pipe(upstream);
  });
  server.listen(3110, "127.0.0.1");
  await once(server, "listening");
  await run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]);
} finally {
  await writeFile("tsconfig.json", originalTsconfig);
  if (originalNextEnv) await writeFile("next-env.d.ts", originalNextEnv);
  server?.closeAllConnections();
  server?.close();
  for (const child of children) if (child.exitCode === null) child.kill();
}
