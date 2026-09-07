import {
  expect,
  test,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { createFixture } from "./fixtures";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, realpath, rm } from "node:fs/promises";

let fixture: Awaited<ReturnType<typeof createFixture>>;
test.beforeEach(async ({ request }) => {
  await request.post("/__test/control", {
    data: { version: 0, fault: "", reset: true, disconnected: false },
  });
  fixture = await createFixture();
});
test.afterEach(async () => {
  await fixture?.cleanup();
});
const controls = (page: Page) => page.getByRole("region", { name: "Offline recipes", exact: true });
async function network(
  context: BrowserContext,
  offline: boolean,
  request: APIRequestContext,
  browserName: string,
) {
  if (browserName !== "webkit" || process.platform !== "win32") {
    await context.setOffline(offline);
    return;
  }
  await request.post("/__test/control", { data: { disconnected: offline } });
  // Only the connectivity signal is supplied by the harness. The app's actual
  // network connections fail at the TCP transport; worker/cache/IDB are real.
  await context.addCookies([
    { name: "ct-test-offline", value: offline ? "1" : "0", url: "http://localhost:3110" },
  ]);
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => !document.cookie.includes("ct-test-offline=1"),
    }),
  );
  for (const page of context.pages())
    await page.evaluate((offline) => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => !document.cookie.includes("ct-test-offline=1"),
      });
      window.dispatchEvent(new Event(offline ? "offline" : "online"));
    }, offline);
}
async function setup(page: Page) {
  await page.goto("/");
  await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
  await expect(controls(page)).toContainText("Available offline", { timeout: 30_000 });
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("common-table-offline", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction("collection");
      const request = tx.objectStore("collection").get("current");
      tx.oncomplete = () => resolve(request.result ? JSON.stringify(request.result) : null);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return result;
  });
}
test("consent, Later suppression and unchanged checks transfer no recipe collection", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    controls(page).getByRole("button", { name: "Download now", exact: true }),
  ).toBeVisible();
  await expect(controls(page)).toContainText("No offline download saved yet");
  await expect(
    controls(page).getByRole("button", { name: "Check for updates", exact: true }),
  ).toHaveCount(0);
  await expect(
    controls(page).getByRole("button", { name: "Remove offline downloads", exact: true }),
  ).toHaveCount(0);
  expect(await stored(page)).toBeNull();
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((items) => items.length),
    ),
  ).toBe(0);
  expect((await (await request.get("/__test/control")).json()).downloads).toHaveLength(0);
  await controls(page).getByRole("button", { name: "Later", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    controls(page).getByRole("button", { name: "Download now", exact: true }),
  ).toHaveCount(0);
  await controls(page).getByRole("button", { name: "Check for updates", exact: true }).click();
  await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
  await expect(controls(page)).toContainText("Available offline");
  const before = await stored(page);
  await controls(page).getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(controls(page)).toContainText("up to date");
  expect(await stored(page)).toBe(before);
  expect((await (await request.get("/__test/control")).json()).downloads).toHaveLength(1);
});

test("cold public navigation opens never-visited recipes, search, choices and Back offline", async ({
  page,
  context,
  browserName,
  request,
}) => {
  await setup(page);
  await network(context, true, request, browserName);
  await page.close();
  const cold = await context.newPage();
  await cold.goto(`/r/${fixture.snapshots[0].recipe.slug}`);
  await expect(cold.getByRole("heading", { name: "Offline stew 00", exact: true })).toBeVisible();
  await cold.getByRole("radio", { name: "Tofu", exact: true }).check();
  await cold
    .getByRole("checkbox", { name: "Hide unused ingredients and steps", exact: true })
    .check();
  await expect(cold).toHaveURL(/choice=/);
  await cold.getByRole("link", { name: "Browse recipes", exact: true }).click();
  await cold.getByRole("textbox", { name: "Exclude ingredients", exact: true }).fill("butter");
  await expect(cold.getByRole("status").filter({ hasText: "recipes found" })).toContainText(
    "22 recipes",
  );
  await expect(cold.getByText("Omit optional Peanut butter.").first()).toBeVisible();
  await cold.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(cold).toHaveURL(/page=2/);
  await cold.goBack();
  await expect(cold.getByRole("textbox", { name: "Exclude ingredients", exact: true })).toHaveValue(
    "butter",
  );
  await cold
    .getByRole("searchbox", { name: "Search recipes", exact: true })
    .fill("Offline stew 00");
  await cold.getByRole("combobox", { name: "Sort by", exact: true }).selectOption("relevance");
  await cold.getByRole("button", { name: "Search", exact: true }).click();
  await expect(cold.getByRole("heading", { name: "Offline stew 00", exact: true })).toBeVisible();
});

test("Later retains saved content while online reads are current; sync sends deltas and removals", async ({
  page,
  context,
  browserName,
  request,
}) => {
  await setup(page);
  const before = await stored(page);
  await fixture.update();
  await fixture.unpublish();
  await controls(page).getByRole("button", { name: "Check for updates", exact: true }).click();
  await expect(controls(page)).toContainText("1 changed recipes, and 1 removals");
  await controls(page).getByRole("button", { name: "Later", exact: true }).click();
  expect(await stored(page)).toBe(before);
  await page.goto(`/r/${fixture.snapshots[0].recipe.slug}`);
  await expect(
    page.getByRole("heading", { name: "Updated public stew", exact: true }),
  ).toBeVisible();
  await network(context, true, request, browserName);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Offline stew 00", exact: true })).toBeVisible();
  await network(context, false, request, browserName);
  // Reconnection presents the offer directly; the check button is replaced.
  await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
  await expect(controls(page)).toContainText("download complete");
  // An open cooking page retains the recipe it loaded even after sync.
  await expect(page.getByRole("heading", { name: "Offline stew 00", exact: true })).toBeVisible();
  const state = JSON.parse((await stored(page))!);
  expect(state.recipes).toHaveLength(21);
  expect(
    state.recipes.some(
      (item: { snapshot: { recipe: { id: string } } }) =>
        item.snapshot.recipe.id === fixture.ids[1],
    ),
  ).toBe(false);
  expect((await (await request.get("/__test/control")).json()).downloads.at(-1)).toEqual([
    fixture.ids[0],
  ]);
});

for (const fault of ["interrupt", "invalid", "quota", "storage"] as const) {
  test(`${fault} failure preserves the previous complete collection`, async ({ page, request }) => {
    await setup(page);
    const before = await stored(page);
    await fixture.update();
    await controls(page).getByRole("button", { name: "Check for updates", exact: true }).click();
    if (fault === "quota" || fault === "storage")
      await page.evaluate((fault) => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
          if (this.name === "collection")
            throw new DOMException(
              "Storage write failed",
              fault === "quota" ? "QuotaExceededError" : "UnknownError",
            );
          return original.apply(this, args);
        };
      }, fault);
    else await request.post("/__test/control", { data: { fault } });
    await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
    await expect(controls(page).getByRole("alert")).toBeVisible();
    if (fault === "quota")
      await expect(controls(page).getByRole("alert")).toContainText("Not enough device space");
    else await expect(controls(page).getByRole("alert")).not.toContainText("device space");
    expect(await stored(page)).toBe(before);
    await expect(controls(page)).toContainText("Available offline");
  });
}

test("a publication change between offer and consent refreshes the offer without committing", async ({
  page,
}) => {
  await setup(page);
  const before = await stored(page);
  await fixture.update();
  await controls(page).getByRole("button", { name: "Check for updates", exact: true }).click();
  await fixture.unpublish();
  await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
  await expect(controls(page)).toContainText("1 removals");
  expect(await stored(page)).toBe(before);
});

for (const fault of ["app", "app-integrity"] as const) {
  test(`${fault} setup failure and confirmed removal are honest and scoped`, async ({
    page,
    context,
    request,
  }) => {
    await page.goto("/");
    await expect(
      controls(page).getByRole("button", { name: "Download now", exact: true }),
    ).toBeVisible();
    await request.post("/__test/control", { data: { fault } });
    await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
    await expect(controls(page).getByRole("alert")).toBeVisible();
    await expect(controls(page)).toContainText("Offline download needs to be completed");
    await expect(controls(page).getByRole("alert")).toContainText("Offline app setup failed");
    await expect(controls(page).getByRole("alert")).not.toContainText("device space");
    expect(await stored(page)).toBeNull();
    await request.post("/__test/control", { data: { fault: "" } });
    await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
    await expect(controls(page)).toContainText("Available offline");
    await page.evaluate(async () => {
      localStorage.setItem("unrelated-data", "keep");
      await caches.open("unrelated-cache");
    });
    await context.addCookies([
      { name: "unrelated-cookie", value: "keep", url: "http://localhost:3110" },
    ]);
    await controls(page)
      .getByRole("button", { name: "Remove offline downloads", exact: true })
      .click();
    expect(await stored(page)).not.toBeNull();
    await controls(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await controls(page)
      .getByRole("button", { name: "Remove offline downloads", exact: true })
      .click();
    await controls(page).getByRole("button", { name: "Confirm removal", exact: true }).click();
    await expect(controls(page)).toContainText("removed from this device");
    await expect(controls(page)).toContainText("No offline download saved yet");
    await expect(
      controls(page).getByRole("button", { name: "Remove offline downloads", exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => caches.keys())).toEqual(["unrelated-cache"]);
    expect(await page.evaluate(() => localStorage.getItem("unrelated-data"))).toBe("keep");
    expect((await context.cookies()).some((cookie) => cookie.name === "unrelated-cookie")).toBe(
      true,
    );
    await page.reload();
    await expect(controls(page)).toContainText("No offline download saved yet");
  });
}

test("a legitimate empty publication collection is available offline after consent", async ({
  page,
  context,
  browserName,
  request,
}) => {
  for (let index = 0; index < fixture.ids.length; index++) await fixture.unpublish(index);
  await setup(page);
  const state = JSON.parse((await stored(page))!);
  expect(state.recipes).toHaveLength(0);
  await network(context, true, request, browserName);
  await page.reload();
  await expect(
    page.getByText("No recipes have been published yet.", { exact: true }),
  ).toBeVisible();
  await expect(controls(page)).toContainText("Available offline");
});

test("reconnection checks a recent publication change without downloading it", async ({
  page,
  context,
  request,
  browserName,
}) => {
  await setup(page);
  const before = await stored(page);
  await network(context, true, request, browserName);
  await fixture.update();
  await network(context, false, request, browserName);
  await expect(
    controls(page).getByRole("button", { name: "Download now", exact: true }),
  ).toBeVisible();
  expect(await stored(page)).toBe(before);
  expect((await (await request.get("/__test/control")).json()).downloads).toHaveLength(1);
});

test("private pages and credentials never enter offline caches or recipes", async ({
  page,
  context,
  browserName,
  request,
}) => {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(fixture.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
  await setup(page);
  await page.goto(`/recipes/${fixture.draftId}/edit/details`);
  await expect(page.locator("#details-title")).toHaveValue("Private unsaved draft");
  const state = await stored(page);
  expect(state).not.toContain("Private unsaved draft");
  expect(state).not.toContain(fixture.email);
  const cache = await page.evaluate(async () => {
    const records: Array<{ path: string; body: string }> = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys()) {
        records.push({
          path: new URL(request.url).pathname,
          body: await (await (await caches.open(name)).match(request))!.text(),
        });
      }
    return records;
  });
  expect(
    cache.every((item) => item.path === "/offline" || item.path.startsWith("/_next/static/")),
  ).toBe(true);
  const html = cache.find((item) => item.path === "/offline")!.body;
  expect(html).not.toContain("Private fixture identity");
  expect(html).not.toContain(fixture.email);
  await network(context, true, request, browserName);
  await expect(page.goto(`/recipes/${fixture.draftId}/edit/details`)).rejects.toThrow();
});

test("a real app upgrade waits for open cooking and unsaved editing pages to close", async ({
  page,
  context,
  browserName,
  request,
}) => {
  await setup(page);
  const cook = await context.newPage();
  await cook.goto(`/r/${fixture.snapshots[0].recipe.slug}`);
  await cook.getByRole("radio", { name: "Tofu", exact: true }).check();
  await cook
    .getByRole("checkbox", { name: "Hide unused ingredients and steps", exact: true })
    .check();
  const editor = await context.newPage();
  await editor.goto("/sign-in");
  await editor.getByRole("textbox", { name: "Email", exact: true }).fill(fixture.email);
  await editor.getByLabel("Password", { exact: true }).fill(fixture.password);
  await editor.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(editor).toHaveURL("/");
  await editor.goto(`/recipes/${fixture.draftId}/edit/details`);
  await editor.locator("#details-title").fill("Keep these unsaved edits");
  const versionBefore = await workerVersion(page);
  await request.post("/__test/control", { data: { version: 1 } });
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect
    .poll(() =>
      page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting),
    )
    .toBe(true);
  expect(await workerVersion(page)).toBe(versionBefore);
  await expect(cook.getByRole("radio", { name: "Tofu", exact: true })).toBeChecked();
  await expect(
    cook.getByRole("checkbox", { name: "Hide unused ingredients and steps", exact: true }),
  ).toBeChecked();
  await expect(editor.locator("#details-title")).toHaveValue("Keep these unsaved edits");
  const before = await stored(page);
  await cook.close();
  await editor.close();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect.poll(() => workerVersion(reopened)).not.toBe(versionBefore);
  expect(await stored(reopened)).toBe(before);
  await network(context, true, request, browserName);
  await reopened.goto(`/r/${fixture.snapshots[0].recipe.slug}`);
  await expect(
    reopened.getByRole("heading", { name: "Offline stew 00", exact: true }),
  ).toBeVisible();
});
async function workerVersion(page: Page) {
  return page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.getRegistration())?.active;
    if (!worker) return null;
    return new Promise<string>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data.version);
      worker.postMessage({ type: "STATUS" }, [channel.port2]);
    });
  });
}

test("a browser process restart can cold-open a never-visited recipe offline", async ({
  playwright,
  browserName,
  request,
}) => {
  // Keep Windows browser cache paths short enough for their native storage APIs.
  const profile = await mkdtemp(join(tmpdir(), "ct-offline-"));
  const options = {
    headless: true,
    baseURL: "http://localhost:3110",
    serviceWorkers: "allow" as const,
    executablePath:
      browserName === "chromium"
        ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        : process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH,
  };
  let persistent = await playwright[browserName].launchPersistentContext(profile, options);
  try {
    await setup(await persistent.newPage());
    await persistent.close();
    persistent = await playwright[browserName].launchPersistentContext(profile, options);
    await network(persistent, true, request, browserName);
    const cold = await persistent.newPage();
    await cold.goto(`/r/${fixture.snapshots[2].recipe.slug}`);
    await expect(cold.getByRole("heading", { name: "Offline stew 02", exact: true })).toBeVisible();
    await cold.getByRole("radio", { name: "Tofu", exact: true }).check();
    await expect(cold).toHaveURL(/choice=/);
  } finally {
    await persistent.close();
    // Only remove this fixture-created profile, after resolving its exact parent.
    if (dirname(await realpath(profile)) !== (await realpath(tmpdir())))
      throw new Error("Unsafe test profile cleanup path.");
    await rm(profile, { recursive: true });
  }
});

test("evicted app files or recipe storage need a new download and can be recovered", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    for (const name of await caches.keys())
      if (name.startsWith("common-table-offline-app-")) await caches.delete(name);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("common-table-offline");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(controls(page)).toContainText("Offline download needs to be completed");
  await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
  await expect(controls(page)).toContainText("Available offline");
});

test("unpublishing does not replace an already open offline cooking page", async ({
  page,
  context,
  browserName,
  request,
}) => {
  await setup(page);
  await network(context, true, request, browserName);
  const cook = await context.newPage();
  await cook.goto(`/r/${fixture.snapshots[1].recipe.slug}`);
  await cook.getByRole("radio", { name: "Tofu", exact: true }).check();
  await cook.getByRole("button", { name: "Instructions", exact: true }).click();
  await fixture.unpublish();
  await network(context, false, request, browserName);
  await controls(page).getByRole("button", { name: "Download now", exact: true }).click();
  await expect(controls(page)).toContainText("download complete");
  await expect(cook.getByRole("heading", { name: "Offline stew 01", exact: true })).toBeVisible();
  await expect(cook.getByRole("radio", { name: "Tofu", exact: true })).toBeChecked();
  await expect(cook.getByRole("button", { name: "Instructions", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await network(context, true, request, browserName);
  await cook.reload();
  await expect(cook.getByRole("heading", { name: "Recipe not saved", exact: true })).toBeVisible();
});
