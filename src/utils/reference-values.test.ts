import { describe, expect, it } from "vitest";

import { normalizeReferenceName, slugifyReferenceName } from "./reference-values";

describe("reference value normalization", () => {
  it("normalizes spacing, casing, and accents", () => {
    expect(normalizeReferenceName("  Crème   Fraîche ")).toBe("creme fraiche");
  });

  it("creates stable URL slugs", () => {
    expect(slugifyReferenceName("Macaroni & Cheese")).toBe("macaroni-and-cheese");
  });
});
