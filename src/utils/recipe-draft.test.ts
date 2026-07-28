import { describe, expect, it } from "vitest";

import { normalizeRecipeDraft, recipeDraftSchema } from "./recipe-draft";

const valid = {
  title: "Family Chili",
  description: "",
  yieldMin: "",
  yieldMax: "",
  yieldUnit: "servings",
};

function messages(values: typeof valid) {
  const result = recipeDraftSchema.safeParse(values);
  return result.success
    ? []
    : Object.values(result.error.flatten().fieldErrors).flatMap((field) => field ?? []);
}

describe("recipeDraftSchema", () => {
  it.each([
    [{ ...valid, title: "" }, "Enter a recipe title."],
    [{ ...valid, title: "   " }, "Enter a recipe title."],
    [{ ...valid, title: "x".repeat(121) }, "Recipe title must be 120 characters or fewer."],
    [{ ...valid, description: "x".repeat(501) }, "Description must be 500 characters or fewer."],
    [{ ...valid, yieldMin: "0" }, "Enter a yield greater than 0."],
    [{ ...valid, yieldMax: "2" }, "Enter a yield greater than 0."],
    [
      { ...valid, yieldMin: "2", yieldMax: "1" },
      "Enter an ending yield greater than or equal to the starting yield.",
    ],
    [{ ...valid, yieldMin: "1.2345" }, "Yield may have at most 3 decimal places."],
    [
      { ...valid, yieldMin: "1", yieldMax: "2.3456" },
      "Ending yield may have at most 3 decimal places.",
    ],
    [{ ...valid, yieldMin: "10000000" }, "Yield must be 9,999,999.999 or less."],
    [
      { ...valid, yieldMin: "1", yieldMax: "10000000" },
      "Ending yield must be 9,999,999.999 or less.",
    ],
    [{ ...valid, yieldUnit: "x".repeat(41) }, "Yield unit must be 40 characters or fewer."],
  ])("rejects invalid input with the required message", (values, message) => {
    expect(messages(values)).toContain(message);
  });

  it.each([valid, { ...valid, yieldMin: "4.5" }, { ...valid, yieldMin: "4.5", yieldMax: "8.25" }])(
    "accepts valid blank, single, and ranged yields",
    (values) => {
      expect(recipeDraftSchema.safeParse(values).success).toBe(true);
    },
  );

  it("trims and normalizes successful input", () => {
    const values = recipeDraftSchema.parse({
      ...valid,
      title: "  Family Chili  ",
      description: "  Cozy food.  ",
      yieldMin: "4.5",
      yieldMax: "8",
      yieldUnit: " bowls ",
    });

    expect(normalizeRecipeDraft(values)).toEqual({
      title: "Family Chili",
      description: "Cozy food.",
      yieldMin: 4.5,
      yieldMax: 8,
      yieldUnit: "bowls",
    });
  });

  it("normalizes blank optional values and a blank unused unit", () => {
    const values = recipeDraftSchema.parse({ ...valid, description: " ", yieldUnit: " " });
    expect(normalizeRecipeDraft(values)).toEqual({
      title: "Family Chili",
      description: null,
      yieldMin: null,
      yieldMax: null,
      yieldUnit: "servings",
    });
  });

  it("normalizes a blank unit with an amount to the servings default", () => {
    const values = recipeDraftSchema.parse({
      ...valid,
      yieldMin: "4",
      yieldUnit: "",
    });
    expect(normalizeRecipeDraft(values).yieldUnit).toBe("servings");
  });
});
