import { describe, expect, it } from "vitest";

import {
  parsePublishedRecipeSnapshot,
  PUBLICATION_FORMAT_VERSION,
  publicationReadiness,
  publicationRequestSchema,
  type PublishedRecipeSnapshot,
} from "./recipe-publication";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function snapshot(): PublishedRecipeSnapshot {
  const line = (value: number, position: number, name: string) => ({
    id: id(value),
    sectionId: id(2),
    choiceGroupId: id(3),
    position,
    ingredientId: null,
    ingredientName: name,
    customIngredient: name,
    quantityMin: null,
    quantityMax: null,
    quantityText: null,
    unitId: null,
    unitName: null,
    customUnit: null,
    preparationNote: null,
    isOptional: false,
  });
  return {
    recipe: {
      id: id(1),
      slug: "family-chili-123",
      title: "Family chili",
      description: null,
      yieldMin: null,
      yieldMax: null,
      yieldUnit: "servings",
    },
    authorDisplayName: "Family cook",
    sections: [{ id: id(2), name: "Filling", position: 0 }],
    choiceGroups: [{ id: id(3), sectionId: id(2), label: "Protein" }],
    ingredients: [
      {
        ...line(4, 0, "Tofu"),
        quantityMin: 1,
        quantityMax: 2,
        unitName: "cups",
        customUnit: "cups",
      },
      { ...line(5, 1, "Pork"), quantityText: "to taste" },
      { ...line(6, 2, "Green onions"), choiceGroupId: null, isOptional: true },
    ],
    steps: [
      {
        id: id(7),
        position: 0,
        instruction: "Prepare the pan.",
        conditionKind: null,
        conditionIngredientId: null,
        conditionLabel: null,
      },
      {
        id: id(8),
        position: 1,
        instruction: "Cook the tofu.",
        conditionKind: "choice_option",
        conditionIngredientId: id(4),
        conditionLabel: "Protein: Tofu",
      },
      {
        id: id(9),
        position: 2,
        instruction: "Add green onions.",
        conditionKind: "optional_ingredient",
        conditionIngredientId: id(6),
        conditionLabel: "Optional: Green onions",
      },
    ],
  };
}

const invalidContent: Array<[string, (value: PublishedRecipeSnapshot) => void]> = [
  [
    "an unknown ingredient section",
    (value) => {
      value.ingredients[0].sectionId = id(99);
    },
  ],
  [
    "an unknown choice group",
    (value) => {
      value.ingredients[0].choiceGroupId = id(99);
    },
  ],
  [
    "a group in an unavailable section",
    (value) => {
      value.choiceGroups[0].sectionId = id(99);
    },
  ],
  [
    "a group option in another section",
    (value) => {
      value.sections.push({ id: id(10), name: "Topping", position: 1 });
      value.ingredients[0].sectionId = id(10);
    },
  ],
  [
    "a group with only one option",
    (value) => {
      value.ingredients[1].choiceGroupId = null;
    },
  ],
  [
    "a group option marked optional",
    (value) => {
      value.ingredients[0].isOptional = true;
    },
  ],
  [
    "a split group",
    (value) => {
      value.ingredients[1].position = 2;
      value.ingredients[2].position = 1;
    },
  ],
  [
    "a condition referencing a missing ingredient",
    (value) => {
      value.steps[1].conditionIngredientId = id(99);
    },
  ],
  [
    "a choice condition referencing an optional line",
    (value) => {
      value.steps[1].conditionIngredientId = id(6);
    },
  ],
  [
    "an optional condition referencing a group option",
    (value) => {
      value.steps[2].conditionIngredientId = id(4);
    },
  ],
  [
    "an optional condition referencing a required line",
    (value) => {
      value.ingredients[2].isOptional = false;
    },
  ],
  [
    "a condition without its ingredient",
    (value) => {
      value.steps[1].conditionIngredientId = null;
    },
  ],
  [
    "a condition ingredient without its kind",
    (value) => {
      value.steps[1].conditionKind = null;
    },
  ],
  [
    "duplicate ingredient identities",
    (value) => {
      value.ingredients[1].id = value.ingredients[0].id;
    },
  ],
  [
    "duplicate ingredient positions",
    (value) => {
      value.ingredients[1].position = 0;
    },
  ],
  [
    "duplicate instruction positions",
    (value) => {
      value.steps[1].position = 0;
    },
  ],
  [
    "duplicate section identities",
    (value) => {
      value.sections.push({ ...value.sections[0], position: 1 });
    },
  ],
  [
    "duplicate choice group identities",
    (value) => {
      value.choiceGroups.push({ ...value.choiceGroups[0] });
    },
  ],
  [
    "both canonical and custom ingredient sources",
    (value) => {
      value.ingredients[0].ingredientId = id(20);
    },
  ],
  [
    "no ingredient source",
    (value) => {
      value.ingredients[0].customIngredient = null;
    },
  ],
  [
    "both canonical and custom unit sources",
    (value) => {
      value.ingredients[0].unitId = id(21);
    },
  ],
  [
    "a missing resolved unit name",
    (value) => {
      value.ingredients[0].unitName = null;
    },
  ],
  [
    "a descending quantity range",
    (value) => {
      value.ingredients[0].quantityMax = 0.5;
    },
  ],
  [
    "a quantity maximum without a minimum",
    (value) => {
      value.ingredients[0].quantityMin = null;
    },
  ],
  [
    "numeric and free-form quantities together",
    (value) => {
      value.ingredients[0].quantityText = "to taste";
    },
  ],
  [
    "a yield maximum without a minimum",
    (value) => {
      value.recipe.yieldMax = 4;
    },
  ],
  [
    "a descending yield range",
    (value) => {
      value.recipe.yieldMin = 4;
      value.recipe.yieldMax = 2;
    },
  ],
  [
    "an empty title",
    (value) => {
      value.recipe.title = " ";
    },
  ],
  [
    "a title above the authoring limit",
    (value) => {
      value.recipe.title = "a".repeat(121);
    },
  ],
  [
    "a description above the authoring limit",
    (value) => {
      value.recipe.description = "a".repeat(501);
    },
  ],
  [
    "a zero yield",
    (value) => {
      value.recipe.yieldMin = 0;
    },
  ],
  [
    "a yield above the storage limit",
    (value) => {
      value.recipe.yieldMin = 10_000_000;
    },
  ],
  [
    "a zero quantity",
    (value) => {
      value.ingredients[0].quantityMin = 0;
    },
  ],
  [
    "a quantity above the storage limit",
    (value) => {
      value.ingredients[0].quantityMax = 100_000_000;
    },
  ],
  [
    "a nonfinite quantity",
    (value) => {
      value.ingredients[0].quantityMax = Infinity;
    },
  ],
  [
    "a fractional position",
    (value) => {
      value.steps[0].position = 0.5;
    },
  ],
  [
    "an instruction above the authoring limit",
    (value) => {
      value.steps[0].instruction = "a".repeat(2_001);
    },
  ],
  [
    "a malformed identity",
    (value) => {
      value.recipe.id = "not-a-uuid";
    },
  ],
  [
    "missing sections",
    (value) => {
      value.sections = [];
    },
  ],
  [
    "missing ingredients",
    (value) => {
      value.ingredients = [];
    },
  ],
  [
    "missing instructions",
    (value) => {
      value.steps = [];
    },
  ],
];

describe("published recipe snapshots", () => {
  it("retains resolved public content and all supported alternative relationships", () => {
    const content = snapshot();
    expect(parsePublishedRecipeSnapshot(PUBLICATION_FORMAT_VERSION, content)).toEqual(content);
  });

  it("accepts the numeric and content limits already supported by authoring", () => {
    const content = snapshot();
    content.recipe.title = "a".repeat(120);
    content.recipe.description = "a".repeat(500);
    content.recipe.yieldMin = 9_999_999.999;
    content.ingredients[0].quantityMax = 99_999_999.9999;
    content.steps[0].instruction = "a".repeat(2_000);
    expect(parsePublishedRecipeSnapshot(PUBLICATION_FORMAT_VERSION, content)).toEqual(content);
  });

  it.each(invalidContent)("rejects %s", (_name, mutate) => {
    const content = snapshot();
    mutate(content);
    expect(parsePublishedRecipeSnapshot(PUBLICATION_FORMAT_VERSION, content)).toBeNull();
  });

  it.each([
    ["snapshot", (value: PublishedRecipeSnapshot) => value],
    ["recipe", (value: PublishedRecipeSnapshot) => value.recipe],
    ["section", (value: PublishedRecipeSnapshot) => value.sections[0]],
    ["choice group", (value: PublishedRecipeSnapshot) => value.choiceGroups[0]],
    ["ingredient", (value: PublishedRecipeSnapshot) => value.ingredients[0]],
    ["instruction", (value: PublishedRecipeSnapshot) => value.steps[0]],
  ] as const)("rejects accidentally captured private fields in a %s", (_name, select) => {
    const content = snapshot();
    Object.assign(select(content), { email: "private@example.invalid", ownerId: "private-owner" });
    expect(parsePublishedRecipeSnapshot(PUBLICATION_FORMAT_VERSION, content)).toBeNull();
  });

  it.each([null, undefined, {}, [], "malformed", { recipe: null }])(
    "fails closed for malformed persisted content %#",
    (content) => {
      expect(parsePublishedRecipeSnapshot(PUBLICATION_FORMAT_VERSION, content)).toBeNull();
    },
  );

  it.each([0, PUBLICATION_FORMAT_VERSION + 1, -1, 1.5])(
    "fails closed for unsupported format version %s",
    (version) => {
      expect(parsePublishedRecipeSnapshot(version, snapshot())).toBeNull();
    },
  );
});

describe("publication controls validation", () => {
  it.each(["publish", "unpublish"] as const)(
    "accepts %s with an explicit saved version",
    (action) => {
      expect(publicationRequestSchema.parse({ action, expectedVersion: 1 })).toEqual({
        action,
        expectedVersion: 1,
      });
    },
  );

  it.each([undefined, null, "1", 0, -1, 1.5, Infinity])(
    "rejects invalid expected versions %s",
    (expectedVersion) => {
      expect(
        publicationRequestSchema.safeParse({ action: "publish", expectedVersion }).success,
      ).toBe(false);
    },
  );

  it("rejects unknown actions and excludes browser-supplied ownership", () => {
    expect(
      publicationRequestSchema.safeParse({ action: "delete", expectedVersion: 1 }).success,
    ).toBe(false);
    expect(
      publicationRequestSchema.parse({
        action: "publish",
        expectedVersion: 1,
        actorUserId: "other-owner",
      }),
    ).toEqual({ action: "publish", expectedVersion: 1 });
  });

  it("reports every missing requirement with the responsible editor stage", () => {
    expect(publicationReadiness({ recipe: { title: " " }, ingredients: [], steps: [] })).toEqual([
      { stage: "details", message: "Add a valid recipe title." },
      { stage: "ingredients", message: "Add at least one ingredient." },
      { stage: "instructions", message: "Add at least one instruction." },
    ]);
    expect(
      publicationReadiness({
        recipe: { title: "a".repeat(121) },
        ingredients: [{}],
        steps: [{}],
      }).map((item) => item.stage),
    ).toEqual(["details"]);
  });

  it("allows omitted description and yield and reports only remaining missing content", () => {
    expect(publicationReadiness(snapshot())).toEqual([]);
    expect(
      publicationReadiness({ recipe: { title: "Soup" }, ingredients: [{}], steps: [] }).map(
        (item) => item.stage,
      ),
    ).toEqual(["instructions"]);
    expect(
      publicationReadiness({ recipe: { title: "Soup" }, ingredients: [], steps: [{}] }).map(
        (item) => item.stage,
      ),
    ).toEqual(["ingredients"]);
  });
});
