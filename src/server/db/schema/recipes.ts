import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestampColumns } from "./helpers";
import { ingredient, taxonomyKind, taxonomyValue, unit } from "./reference";

export const recipeStatus = pgEnum("recipe_status", ["draft", "published", "archived"]);

export const taxonomySource = pgEnum("taxonomy_source", ["author", "derived", "admin"]);

export const recipeStepConditionKind = pgEnum("recipe_step_condition_kind", [
  "choice_option",
  "optional_ingredient",
]);

export const recipe = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: recipeStatus("status").notNull().default("draft"),
    yieldMin: numeric("yield_min", { precision: 10, scale: 3, mode: "number" }),
    yieldMax: numeric("yield_max", { precision: 10, scale: 3, mode: "number" }),
    yieldUnit: text("yield_unit").notNull().default("servings"),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestampColumns(),
  },
  (table) => [
    uniqueIndex("recipes_slug_unique").on(table.slug),
    index("recipes_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("recipes_status_published_idx").on(table.status, table.publishedAt),
    check("recipes_title_not_blank", sql`btrim(${table.title}) <> ''`),
    check("recipes_version_positive", sql`${table.version} > 0`),
    check(
      "recipes_yield_bounds_valid",
      sql`
        (${table.yieldMin} is null or ${table.yieldMin} > 0)
        and (${table.yieldMax} is null or ${table.yieldMax} > 0)
        and (${table.yieldMax} is null or ${table.yieldMin} is not null)
        and (
          ${table.yieldMin} is null
          or ${table.yieldMax} is null
          or ${table.yieldMax} >= ${table.yieldMin}
        )
      `,
    ),
    check(
      "recipes_publication_state_valid",
      sql`
        (${table.status} = 'published' and ${table.publishedAt} is not null)
        or (${table.status} <> 'published')
      `,
    ),
  ],
);

export const recipePhoto = pgTable(
  "recipe_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    altText: text("alt_text").notNull(),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recipe_photos_storage_key_unique").on(table.storageKey),
    uniqueIndex("recipe_photos_recipe_position_unique").on(table.recipeId, table.position),
    uniqueIndex("recipe_photos_one_primary_per_recipe")
      .on(table.recipeId)
      .where(sql`${table.isPrimary}`),
    check("recipe_photos_position_nonnegative", sql`${table.position} >= 0`),
    check("recipe_photos_alt_text_not_blank", sql`btrim(${table.altText}) <> ''`),
    check(
      "recipe_photos_dimensions_valid",
      sql`
        (${table.width} is null or ${table.width} > 0)
        and (${table.height} is null or ${table.height} > 0)
      `,
    ),
  ],
);

export const recipeIngredientSection = pgTable(
  "recipe_ingredient_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    name: text("name"),
    position: integer("position").notNull(),
  },
  (table) => [
    unique("recipe_ingredient_sections_id_recipe_unique").on(table.id, table.recipeId),
    uniqueIndex("recipe_ingredient_sections_recipe_position_unique").on(
      table.recipeId,
      table.position,
    ),
    uniqueIndex("recipe_ingredient_sections_recipe_name_unique")
      .on(table.recipeId, sql`lower(btrim(${table.name}))`)
      .where(sql`${table.name} is not null`),
    check("recipe_ingredient_sections_position_nonnegative", sql`${table.position} >= 0`),
    check(
      "recipe_ingredient_sections_name_valid",
      sql`${table.name} is null or btrim(${table.name}) <> ''`,
    ),
  ],
);

export const recipeIngredientChoiceGroup = pgTable(
  "recipe_ingredient_choice_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    foreignKey({
      name: "recipe_ingredient_choice_groups_section_recipe_fk",
      columns: [table.sectionId, table.recipeId],
      foreignColumns: [recipeIngredientSection.id, recipeIngredientSection.recipeId],
    }).onDelete("cascade"),
    unique("recipe_ingredient_choice_groups_id_recipe_section_unique").on(
      table.id,
      table.recipeId,
      table.sectionId,
    ),
    index("recipe_ingredient_choice_groups_recipe_id_idx").on(table.recipeId),
    check("recipe_ingredient_choice_groups_label_not_blank", sql`btrim(${table.label}) <> ''`),
  ],
);

export const recipeIngredient = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    choiceGroupId: uuid("choice_group_id"),
    position: integer("position").notNull(),
    quantityMin: numeric("quantity_min", { precision: 12, scale: 4, mode: "number" }),
    quantityMax: numeric("quantity_max", { precision: 12, scale: 4, mode: "number" }),
    quantityText: text("quantity_text"),
    unitId: uuid("unit_id").references(() => unit.id, { onDelete: "restrict" }),
    customUnit: text("custom_unit"),
    ingredientId: uuid("ingredient_id").references(() => ingredient.id, {
      onDelete: "restrict",
    }),
    customIngredient: text("custom_ingredient"),
    preparationNote: text("preparation_note"),
    isOptional: boolean("is_optional").notNull().default(false),
  },
  (table) => [
    // Pair the section ID with the recipe ID so an ingredient cannot point at another recipe's section.
    foreignKey({
      name: "recipe_ingredients_section_recipe_fk",
      columns: [table.sectionId, table.recipeId],
      foreignColumns: [recipeIngredientSection.id, recipeIngredientSection.recipeId],
    }).onDelete("cascade"),
    foreignKey({
      name: "recipe_ingredients_choice_group_recipe_section_fk",
      columns: [table.choiceGroupId, table.recipeId, table.sectionId],
      foreignColumns: [
        recipeIngredientChoiceGroup.id,
        recipeIngredientChoiceGroup.recipeId,
        recipeIngredientChoiceGroup.sectionId,
      ],
    }).onDelete("restrict"),
    unique("recipe_ingredients_id_recipe_unique").on(table.id, table.recipeId),
    uniqueIndex("recipe_ingredients_section_position_unique").on(table.sectionId, table.position),
    index("recipe_ingredients_recipe_id_idx").on(table.recipeId),
    index("recipe_ingredients_ingredient_id_idx").on(table.ingredientId),
    check("recipe_ingredients_position_nonnegative", sql`${table.position} >= 0`),
    check(
      "recipe_ingredients_choice_group_not_optional",
      sql`${table.choiceGroupId} is null or not ${table.isOptional}`,
    ),
    // Each line uses either a canonical ingredient or custom text, never both.
    check(
      "recipe_ingredients_exactly_one_ingredient",
      sql`
        num_nonnulls(
          ${table.ingredientId},
          nullif(btrim(${table.customIngredient}), '')
        ) = 1
      `,
    ),
    check(
      "recipe_ingredients_at_most_one_unit",
      sql`
        num_nonnulls(
          ${table.unitId},
          nullif(btrim(${table.customUnit}), '')
        ) <= 1
      `,
    ),
    check(
      "recipe_ingredients_quantity_valid",
      sql`
        (${table.quantityMin} is null or ${table.quantityMin} >= 0)
        and (${table.quantityMax} is null or ${table.quantityMax} >= 0)
        and (${table.quantityMax} is null or ${table.quantityMin} is not null)
        and (
          ${table.quantityMin} is null
          or ${table.quantityMax} is null
          or ${table.quantityMax} >= ${table.quantityMin}
        )
        and not (
          ${table.quantityMin} is not null
          and nullif(btrim(${table.quantityText}), '') is not null
        )
      `,
    ),
  ],
);

export const recipeStep = pgTable(
  "recipe_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    instruction: text("instruction").notNull(),
    conditionKind: recipeStepConditionKind("condition_kind"),
    conditionIngredientId: uuid("condition_ingredient_id"),
  },
  (table) => [
    foreignKey({
      name: "recipe_steps_condition_ingredient_recipe_fk",
      columns: [table.conditionIngredientId, table.recipeId],
      foreignColumns: [recipeIngredient.id, recipeIngredient.recipeId],
    }).onDelete("restrict"),
    uniqueIndex("recipe_steps_recipe_position_unique").on(table.recipeId, table.position),
    index("recipe_steps_condition_ingredient_id_idx").on(table.conditionIngredientId),
    check("recipe_steps_position_nonnegative", sql`${table.position} >= 0`),
    check("recipe_steps_instruction_not_blank", sql`btrim(${table.instruction}) <> ''`),
    check(
      "recipe_steps_condition_complete",
      sql`num_nonnulls(${table.conditionKind}, ${table.conditionIngredientId}) in (0, 2)`,
    ),
  ],
);

export const recipeTaxonomyValue = pgTable(
  "recipe_taxonomy_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    kind: taxonomyKind("kind").notNull(),
    taxonomyValueId: uuid("taxonomy_value_id"),
    customValue: text("custom_value"),
    normalizedCustomValue: text("normalized_custom_value"),
    source: taxonomySource("source").notNull().default("author"),
    derivationRule: text("derivation_rule"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Include the kind in the foreign key so a cuisine ID cannot be stored as a dietary value.
    foreignKey({
      name: "recipe_taxonomy_values_canonical_kind_fk",
      columns: [table.taxonomyValueId, table.kind],
      foreignColumns: [taxonomyValue.id, taxonomyValue.kind],
    }).onDelete("restrict"),
    uniqueIndex("recipe_taxonomy_values_canonical_unique")
      .on(table.recipeId, table.kind, table.taxonomyValueId)
      .where(sql`${table.taxonomyValueId} is not null`),
    uniqueIndex("recipe_taxonomy_values_custom_unique")
      .on(table.recipeId, table.kind, table.normalizedCustomValue)
      .where(sql`${table.normalizedCustomValue} is not null`),
    index("recipe_taxonomy_values_filter_idx").on(table.kind, table.taxonomyValueId),
    check(
      "recipe_taxonomy_values_exactly_one_value",
      sql`
        num_nonnulls(
          ${table.taxonomyValueId},
          nullif(btrim(${table.customValue}), '')
        ) = 1
      `,
    ),
    check(
      "recipe_taxonomy_values_custom_normalization_valid",
      sql`
        (
          ${table.customValue} is null
          and ${table.normalizedCustomValue} is null
        )
        or (
          nullif(btrim(${table.customValue}), '') is not null
          and nullif(btrim(${table.normalizedCustomValue}), '') is not null
        )
      `,
    ),
    check(
      "recipe_taxonomy_values_derivation_valid",
      sql`
        (${table.source} <> 'derived' and ${table.derivationRule} is null)
        or (
          ${table.source} = 'derived'
          and ${table.kind} = 'dietary'
          and nullif(btrim(${table.derivationRule}), '') is not null
        )
      `,
    ),
  ],
);

export const recipeRelations = relations(recipe, ({ many, one }) => ({
  owner: one(user, {
    fields: [recipe.ownerId],
    references: [user.id],
  }),
  photos: many(recipePhoto),
  ingredientSections: many(recipeIngredientSection),
  ingredientChoiceGroups: many(recipeIngredientChoiceGroup),
  ingredients: many(recipeIngredient),
  steps: many(recipeStep),
  taxonomyValues: many(recipeTaxonomyValue),
}));

export const recipePhotoRelations = relations(recipePhoto, ({ one }) => ({
  recipe: one(recipe, {
    fields: [recipePhoto.recipeId],
    references: [recipe.id],
  }),
  uploadedBy: one(user, {
    fields: [recipePhoto.uploadedById],
    references: [user.id],
  }),
}));

export const recipeIngredientSectionRelations = relations(
  recipeIngredientSection,
  ({ many, one }) => ({
    recipe: one(recipe, {
      fields: [recipeIngredientSection.recipeId],
      references: [recipe.id],
    }),
    ingredients: many(recipeIngredient),
    choiceGroups: many(recipeIngredientChoiceGroup),
  }),
);

export const recipeIngredientChoiceGroupRelations = relations(
  recipeIngredientChoiceGroup,
  ({ many, one }) => ({
    recipe: one(recipe, {
      fields: [recipeIngredientChoiceGroup.recipeId],
      references: [recipe.id],
    }),
    section: one(recipeIngredientSection, {
      fields: [recipeIngredientChoiceGroup.sectionId],
      references: [recipeIngredientSection.id],
    }),
    options: many(recipeIngredient),
  }),
);

export const recipeIngredientRelations = relations(recipeIngredient, ({ one }) => ({
  recipe: one(recipe, {
    fields: [recipeIngredient.recipeId],
    references: [recipe.id],
  }),
  section: one(recipeIngredientSection, {
    fields: [recipeIngredient.sectionId],
    references: [recipeIngredientSection.id],
  }),
  choiceGroup: one(recipeIngredientChoiceGroup, {
    fields: [recipeIngredient.choiceGroupId],
    references: [recipeIngredientChoiceGroup.id],
  }),
  ingredient: one(ingredient, {
    fields: [recipeIngredient.ingredientId],
    references: [ingredient.id],
  }),
  unit: one(unit, {
    fields: [recipeIngredient.unitId],
    references: [unit.id],
  }),
}));

export const recipeStepRelations = relations(recipeStep, ({ one }) => ({
  recipe: one(recipe, {
    fields: [recipeStep.recipeId],
    references: [recipe.id],
  }),
  conditionIngredient: one(recipeIngredient, {
    fields: [recipeStep.conditionIngredientId],
    references: [recipeIngredient.id],
  }),
}));

export const recipeTaxonomyValueRelations = relations(recipeTaxonomyValue, ({ one }) => ({
  recipe: one(recipe, {
    fields: [recipeTaxonomyValue.recipeId],
    references: [recipe.id],
  }),
  taxonomyValue: one(taxonomyValue, {
    fields: [recipeTaxonomyValue.taxonomyValueId],
    references: [taxonomyValue.id],
  }),
}));
