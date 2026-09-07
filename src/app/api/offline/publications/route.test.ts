// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), download: vi.fn() }));
vi.mock("@/server/recipes/offline-publications", () => ({
  readOfflinePublications: mocks.read,
  downloadOfflinePublications: mocks.download,
}));
import { GET, POST } from "./route";
const request = (value: unknown) =>
  new Request("http://localhost/api/offline/publications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
beforeEach(() => vi.clearAllMocks());
describe("anonymous offline API", () => {
  it("checks metadata without returning recipe bodies and disables response caching", async () => {
    mocks.read.mockResolvedValue({
      manifest: { revision: "revision" },
      recipes: [{ private: "never returned" }],
    });
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ revision: "revision" });
  });
  it("distinguishes failure and conflict from an empty collection", async () => {
    mocks.read.mockRejectedValue(new Error("database secret"));
    const failed = await GET();
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
    mocks.download.mockResolvedValue(null);
    expect((await POST(request({ revision: "a".repeat(64), known: [] }))).status).toBe(409);
  });
  it("rejects invalid/oversized requests before querying publications", async () => {
    expect((await POST(request({ revision: "bad", known: [] }))).status).toBe(400);
    expect((await POST(request({ value: "x".repeat(256 * 1024) }))).status).toBe(400);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
