import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "./page";
const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("legacy search redirect", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves supported values, repeated filters and invalid inputs for Browse correction", async () => {
    await SearchPage({
      searchParams: Promise.resolve({
        q: "bean soup",
        include: ["chicken", "tofu"],
        exclude: "butter,,oil",
        sort: "newest",
        page: "2",
        unsupported: "ignore",
      }),
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/?q=bean+soup&include=chicken&include=tofu&exclude=butter%2C%2Coil&sort=newest&page=2",
    );
  });
  it("redirects the bare Search route to Browse", async () => {
    await SearchPage({ searchParams: Promise.resolve({}) });
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
