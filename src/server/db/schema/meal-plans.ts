import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestampColumns } from "./helpers";
import { recipe } from "./recipes";

export const mealPlanEntrySource = pgEnum("meal_plan_entry_source", ["manual", "generated"]);

export const mealPlan = pgTable(
  "meal_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    ...timestampColumns(),
  },
  (table) => [
    index("meal_plans_owner_week_idx").on(table.ownerId, table.weekStart),
    check("meal_plans_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);

export const mealPlanSlot = pgTable(
  "meal_plan_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealPlanId: uuid("meal_plan_id")
      .notNull()
      .references(() => mealPlan.id, { onDelete: "cascade" }),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("meal_plan_slots_plan_date_position_unique").on(
      table.mealPlanId,
      table.plannedDate,
      table.position,
    ),
    index("meal_plan_slots_plan_date_idx").on(table.mealPlanId, table.plannedDate),
    check("meal_plan_slots_position_nonnegative", sql`${table.position} >= 0`),
    check("meal_plan_slots_label_not_blank", sql`btrim(${table.label}) <> ''`),
  ],
);

export const mealPlanGenerationRun = pgTable(
  "meal_plan_generation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealPlanId: uuid("meal_plan_id")
      .notNull()
      .references(() => mealPlan.id, { onDelete: "cascade" }),
    criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull(),
    seed: integer("seed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("meal_plan_generation_runs_plan_created_idx").on(table.mealPlanId, table.createdAt),
  ],
);

export const mealPlanEntry = pgTable(
  "meal_plan_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => mealPlanSlot.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    source: mealPlanEntrySource("source").notNull().default("manual"),
    isLocked: boolean("is_locked").notNull().default(false),
    generationRunId: uuid("generation_run_id").references(() => mealPlanGenerationRun.id, {
      onDelete: "set null",
    }),
    score: numeric("score", { precision: 12, scale: 4, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("meal_plan_entries_slot_unique").on(table.slotId),
    index("meal_plan_entries_recipe_id_idx").on(table.recipeId),
    check(
      "meal_plan_entries_generation_source_valid",
      sql`
        (${table.source} = 'manual' and ${table.generationRunId} is null)
        or (${table.source} = 'generated' and ${table.generationRunId} is not null)
      `,
    ),
  ],
);

export const mealPlanRelations = relations(mealPlan, ({ many, one }) => ({
  owner: one(user, {
    fields: [mealPlan.ownerId],
    references: [user.id],
  }),
  slots: many(mealPlanSlot),
  generationRuns: many(mealPlanGenerationRun),
}));

export const mealPlanSlotRelations = relations(mealPlanSlot, ({ many, one }) => ({
  mealPlan: one(mealPlan, {
    fields: [mealPlanSlot.mealPlanId],
    references: [mealPlan.id],
  }),
  entries: many(mealPlanEntry),
}));

export const mealPlanGenerationRunRelations = relations(mealPlanGenerationRun, ({ many, one }) => ({
  mealPlan: one(mealPlan, {
    fields: [mealPlanGenerationRun.mealPlanId],
    references: [mealPlan.id],
  }),
  entries: many(mealPlanEntry),
}));

export const mealPlanEntryRelations = relations(mealPlanEntry, ({ one }) => ({
  slot: one(mealPlanSlot, {
    fields: [mealPlanEntry.slotId],
    references: [mealPlanSlot.id],
  }),
  recipe: one(recipe, {
    fields: [mealPlanEntry.recipeId],
    references: [recipe.id],
  }),
  generationRun: one(mealPlanGenerationRun, {
    fields: [mealPlanEntry.generationRunId],
    references: [mealPlanGenerationRun.id],
  }),
}));
