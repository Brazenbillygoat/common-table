import { describe, expect, it } from "vitest";

import { resolveAuthUrl } from "./url";

describe("resolveAuthUrl", () => {
  it.each(["http://localhost:3000", "https://recipes.example.com"])(
    "keeps an explicit URL ahead of the Vercel hostname: %s",
    (explicitUrl) => {
      expect(
        resolveAuthUrl({
          BETTER_AUTH_URL: explicitUrl,
          VERCEL_PROJECT_PRODUCTION_URL: "common-table-example.vercel.app",
        }),
      ).toBe(explicitUrl);
    },
  );

  it.each([undefined, "", "   "])(
    "uses HTTPS on the assigned production hostname when the explicit URL is blank: %s",
    (explicitUrl) => {
      expect(
        resolveAuthUrl({
          BETTER_AUTH_URL: explicitUrl,
          VERCEL_PROJECT_PRODUCTION_URL: "common-table-example.vercel.app",
        }),
      ).toBe("https://common-table-example.vercel.app");
    },
  );

  it("supports a production custom domain", () => {
    expect(resolveAuthUrl({ VERCEL_PROJECT_PRODUCTION_URL: "recipes.example.com" })).toBe(
      "https://recipes.example.com",
    );
  });

  it("leaves a malformed explicit URL for validation instead of hiding it with a fallback", () => {
    expect(
      resolveAuthUrl({
        BETTER_AUTH_URL: "not-a-url",
        VERCEL_PROJECT_PRODUCTION_URL: "common-table-example.vercel.app",
      }),
    ).toBe("not-a-url");
  });

  it("does not invent a URL when neither setting is available", () => {
    expect(resolveAuthUrl({})).toBeUndefined();
    expect(
      resolveAuthUrl({ BETTER_AUTH_URL: " ", VERCEL_PROJECT_PRODUCTION_URL: " " }),
    ).toBeUndefined();
  });
});
