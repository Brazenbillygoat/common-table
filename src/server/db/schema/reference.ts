import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestampColumns } from "./helpers";

export const taxonomyKind = pgEnum("taxonomy_kind", [
  "cuisine",
  "meal_type",
  "technique",
  "dietary",
  "flavor",
  "tag",
]);

export const unitKind = pgEnum("unit_kind", ["volume", "weight", "count", "other"]);

export const ingredient = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    slug: text("slug").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("ingredients_normalized_name_unique").on(table.normalizedName),
    uniqueIndex("ingredients_slug_unique").on(table.slug),
    index("ingredients_active_name_idx").on(table.isActive, table.name),
  ],
);

export const unit = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: unitKind("kind").notNull(),
    name: text("name").notNull(),
    pluralName: text("plural_name").notNull(),
    abbreviation: text("abbreviation"),
    normalizedName: text("normalized_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("units_normalized_name_unique").on(table.normalizedName),
    index("units_active_name_idx").on(table.isActive, table.name),
  ],
);

export const taxonomyValue = pgTable(
  "taxonomy_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: taxonomyKind("kind").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    slug: text("slug").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestampColumns(),
  },
  (table) => [
    unique("taxonomy_values_id_kind_unique").on(table.id, table.kind),
    uniqueIndex("taxonomy_values_kind_normalized_name_unique").on(table.kind, table.normalizedName),
    uniqueIndex("taxonomy_values_kind_slug_unique").on(table.kind, table.slug),
    index("taxonomy_values_kind_active_name_idx").on(table.kind, table.isActive, table.name),
  ],
);
