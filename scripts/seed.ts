import "dotenv/config";

import { closeDatabase, getDatabase } from "../src/server/db/client";
import { ingredient, taxonomyValue, unit, taxonomyKind, unitKind } from "../src/server/db/schema";
import { normalizeReferenceName, slugifyReferenceName } from "../src/utils/reference-values";

type TaxonomyKind = (typeof taxonomyKind.enumValues)[number];
type UnitKind = (typeof unitKind.enumValues)[number];

const units: Array<{
  kind: UnitKind;
  name: string;
  pluralName: string;
  abbreviation?: string;
}> = [
  { kind: "volume", name: "teaspoon", pluralName: "teaspoons", abbreviation: "tsp" },
  { kind: "volume", name: "tablespoon", pluralName: "tablespoons", abbreviation: "tbsp" },
  { kind: "volume", name: "cup", pluralName: "cups" },
  { kind: "volume", name: "fluid ounce", pluralName: "fluid ounces", abbreviation: "fl oz" },
  { kind: "volume", name: "milliliter", pluralName: "milliliters", abbreviation: "mL" },
  { kind: "volume", name: "liter", pluralName: "liters", abbreviation: "L" },
  { kind: "weight", name: "ounce", pluralName: "ounces", abbreviation: "oz" },
  { kind: "weight", name: "pound", pluralName: "pounds", abbreviation: "lb" },
  { kind: "weight", name: "gram", pluralName: "grams", abbreviation: "g" },
  { kind: "weight", name: "kilogram", pluralName: "kilograms", abbreviation: "kg" },
  { kind: "count", name: "piece", pluralName: "pieces" },
  { kind: "count", name: "clove", pluralName: "cloves" },
  { kind: "count", name: "can", pluralName: "cans" },
  { kind: "count", name: "package", pluralName: "packages", abbreviation: "pkg" },
  { kind: "other", name: "pinch", pluralName: "pinches" },
];

const taxonomy: Record<TaxonomyKind, string[]> = {
  cuisine: [
    "American",
    "Chinese",
    "French",
    "Indian",
    "Italian",
    "Japanese",
    "Korean",
    "Mediterranean",
    "Mexican",
    "Middle Eastern",
    "Southern",
    "Thai",
    "Tex-Mex",
  ],
  meal_type: [
    "Appetizer",
    "Breakfast",
    "Brunch",
    "Dessert",
    "Dinner",
    "Lunch",
    "Side Dish",
    "Snack",
  ],
  technique: [
    "Air Fry",
    "Bake",
    "Boil",
    "Braise",
    "Fry",
    "Grill",
    "No-Cook",
    "Pressure Cook",
    "Roast",
    "Sauté",
    "Simmer",
    "Slow Cook",
    "Steam",
  ],
  dietary: [
    "Dairy-Free",
    "Egg-Free",
    "Gluten-Free",
    "Nut-Free",
    "Pescatarian",
    "Vegan",
    "Vegetarian",
  ],
  flavor: ["Comforting", "Fresh", "Rich", "Savory", "Smoky", "Spicy", "Sweet", "Tangy"],
  tag: ["Family Favorite", "Freezer-Friendly", "Make-Ahead", "One-Pot", "Weeknight"],
};

const ingredients = [
  "all-purpose flour",
  "baking powder",
  "baking soda",
  "black pepper",
  "brown sugar",
  "butter",
  "carrot",
  "cheddar cheese",
  "chicken breast",
  "chicken stock",
  "cinnamon",
  "egg",
  "garlic",
  "ginger",
  "granulated sugar",
  "ground beef",
  "kosher salt",
  "lemon",
  "milk",
  "olive oil",
  "onion",
  "paprika",
  "parmesan cheese",
  "potato",
  "rice",
  "soy sauce",
  "tomato",
  "vanilla extract",
  "vegetable oil",
];

async function seed() {
  const db = getDatabase();

  await db
    .insert(unit)
    .values(
      units.map((value) => ({
        ...value,
        normalizedName: normalizeReferenceName(value.name),
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(taxonomyValue)
    .values(
      Object.entries(taxonomy).flatMap(([kind, values]) =>
        values.map((name) => ({
          kind: kind as TaxonomyKind,
          name,
          normalizedName: normalizeReferenceName(name),
          slug: slugifyReferenceName(name),
        })),
      ),
    )
    .onConflictDoNothing();

  await db
    .insert(ingredient)
    .values(
      ingredients.map((name) => ({
        name,
        normalizedName: normalizeReferenceName(name),
        slug: slugifyReferenceName(name),
      })),
    )
    .onConflictDoNothing();
}

seed()
  .then(() => {
    console.log("Reference data seeded.");
  })
  .catch((error: unknown) => {
    console.error("Reference data seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
