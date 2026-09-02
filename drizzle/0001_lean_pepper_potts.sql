CREATE TYPE "public"."recipe_step_condition_kind" AS ENUM('choice_option', 'optional_ingredient');--> statement-breakpoint
CREATE TABLE "recipe_ingredient_choice_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "recipe_ingredient_choice_groups_id_recipe_section_unique" UNIQUE("id","recipe_id","section_id"),
	CONSTRAINT "recipe_ingredient_choice_groups_label_not_blank" CHECK (btrim("recipe_ingredient_choice_groups"."label") <> '')
);
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "choice_group_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD COLUMN "condition_kind" "recipe_step_condition_kind";--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD COLUMN "condition_ingredient_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_ingredient_choice_groups" ADD CONSTRAINT "recipe_ingredient_choice_groups_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient_choice_groups" ADD CONSTRAINT "recipe_ingredient_choice_groups_section_recipe_fk" FOREIGN KEY ("section_id","recipe_id") REFERENCES "public"."recipe_ingredient_sections"("id","recipe_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_ingredient_choice_groups_recipe_id_idx" ON "recipe_ingredient_choice_groups" USING btree ("recipe_id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_id_recipe_unique" UNIQUE("id","recipe_id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_choice_group_recipe_section_fk" FOREIGN KEY ("choice_group_id","recipe_id","section_id") REFERENCES "public"."recipe_ingredient_choice_groups"("id","recipe_id","section_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_condition_ingredient_recipe_fk" FOREIGN KEY ("condition_ingredient_id","recipe_id") REFERENCES "public"."recipe_ingredients"("id","recipe_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredient_sections_recipe_name_unique" ON "recipe_ingredient_sections" USING btree ("recipe_id",lower(btrim("name"))) WHERE "recipe_ingredient_sections"."name" is not null;--> statement-breakpoint
CREATE INDEX "recipe_steps_condition_ingredient_id_idx" ON "recipe_steps" USING btree ("condition_ingredient_id");--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_choice_group_not_optional" CHECK ("recipe_ingredients"."choice_group_id" is null or not "recipe_ingredients"."is_optional");--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_condition_complete" CHECK (num_nonnulls("recipe_steps"."condition_kind", "recipe_steps"."condition_ingredient_id") in (0, 2));
