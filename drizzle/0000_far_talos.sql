CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
CREATE TYPE "public"."meal_plan_entry_source" AS ENUM('manual', 'generated');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_source" AS ENUM('author', 'derived', 'admin');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_kind" AS ENUM('cuisine', 'meal_type', 'technique', 'dietary', 'flavor', 'tag');--> statement-breakpoint
CREATE TYPE "public"."unit_kind" AS ENUM('volume', 'weight', 'count', 'other');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plans_name_not_blank" CHECK (btrim("meal_plans"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "meal_plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"source" "meal_plan_entry_source" DEFAULT 'manual' NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"generation_run_id" uuid,
	"score" numeric(12, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plan_entries_generation_source_valid" CHECK (
        ("meal_plan_entries"."source" = 'manual' and "meal_plan_entries"."generation_run_id" is null)
        or ("meal_plan_entries"."source" = 'generated' and "meal_plan_entries"."generation_run_id" is not null)
      )
);
--> statement-breakpoint
CREATE TABLE "meal_plan_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_plan_id" uuid NOT NULL,
	"criteria" jsonb NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_plan_id" uuid NOT NULL,
	"planned_date" date NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "meal_plan_slots_position_nonnegative" CHECK ("meal_plan_slots"."position" >= 0),
	CONSTRAINT "meal_plan_slots_label_not_blank" CHECK (btrim("meal_plan_slots"."label") <> '')
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "recipe_status" DEFAULT 'draft' NOT NULL,
	"yield_min" numeric(10, 3),
	"yield_max" numeric(10, 3),
	"yield_unit" text DEFAULT 'servings' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_title_not_blank" CHECK (btrim("recipes"."title") <> ''),
	CONSTRAINT "recipes_version_positive" CHECK ("recipes"."version" > 0),
	CONSTRAINT "recipes_yield_bounds_valid" CHECK (
        ("recipes"."yield_min" is null or "recipes"."yield_min" > 0)
        and ("recipes"."yield_max" is null or "recipes"."yield_max" > 0)
        and ("recipes"."yield_max" is null or "recipes"."yield_min" is not null)
        and (
          "recipes"."yield_min" is null
          or "recipes"."yield_max" is null
          or "recipes"."yield_max" >= "recipes"."yield_min"
        )
      ),
	CONSTRAINT "recipes_publication_state_valid" CHECK (
        ("recipes"."status" = 'published' and "recipes"."published_at" is not null)
        or ("recipes"."status" <> 'published')
      )
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"quantity_min" numeric(12, 4),
	"quantity_max" numeric(12, 4),
	"quantity_text" text,
	"unit_id" uuid,
	"custom_unit" text,
	"ingredient_id" uuid,
	"custom_ingredient" text,
	"preparation_note" text,
	"is_optional" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recipe_ingredients_position_nonnegative" CHECK ("recipe_ingredients"."position" >= 0),
	CONSTRAINT "recipe_ingredients_exactly_one_ingredient" CHECK (
        num_nonnulls(
          "recipe_ingredients"."ingredient_id",
          nullif(btrim("recipe_ingredients"."custom_ingredient"), '')
        ) = 1
      ),
	CONSTRAINT "recipe_ingredients_at_most_one_unit" CHECK (
        num_nonnulls(
          "recipe_ingredients"."unit_id",
          nullif(btrim("recipe_ingredients"."custom_unit"), '')
        ) <= 1
      ),
	CONSTRAINT "recipe_ingredients_quantity_valid" CHECK (
        ("recipe_ingredients"."quantity_min" is null or "recipe_ingredients"."quantity_min" >= 0)
        and ("recipe_ingredients"."quantity_max" is null or "recipe_ingredients"."quantity_max" >= 0)
        and ("recipe_ingredients"."quantity_max" is null or "recipe_ingredients"."quantity_min" is not null)
        and (
          "recipe_ingredients"."quantity_min" is null
          or "recipe_ingredients"."quantity_max" is null
          or "recipe_ingredients"."quantity_max" >= "recipe_ingredients"."quantity_min"
        )
        and not (
          "recipe_ingredients"."quantity_min" is not null
          and nullif(btrim("recipe_ingredients"."quantity_text"), '') is not null
        )
      )
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"name" text,
	"position" integer NOT NULL,
	CONSTRAINT "recipe_ingredient_sections_id_recipe_unique" UNIQUE("id","recipe_id"),
	CONSTRAINT "recipe_ingredient_sections_position_nonnegative" CHECK ("recipe_ingredient_sections"."position" >= 0),
	CONSTRAINT "recipe_ingredient_sections_name_valid" CHECK ("recipe_ingredient_sections"."name" is null or btrim("recipe_ingredient_sections"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "recipe_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" text NOT NULL,
	"width" integer,
	"height" integer,
	"position" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_photos_position_nonnegative" CHECK ("recipe_photos"."position" >= 0),
	CONSTRAINT "recipe_photos_alt_text_not_blank" CHECK (btrim("recipe_photos"."alt_text") <> ''),
	CONSTRAINT "recipe_photos_dimensions_valid" CHECK (
        ("recipe_photos"."width" is null or "recipe_photos"."width" > 0)
        and ("recipe_photos"."height" is null or "recipe_photos"."height" > 0)
      )
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL,
	CONSTRAINT "recipe_steps_position_nonnegative" CHECK ("recipe_steps"."position" >= 0),
	CONSTRAINT "recipe_steps_instruction_not_blank" CHECK (btrim("recipe_steps"."instruction") <> '')
);
--> statement-breakpoint
CREATE TABLE "recipe_taxonomy_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"kind" "taxonomy_kind" NOT NULL,
	"taxonomy_value_id" uuid,
	"custom_value" text,
	"normalized_custom_value" text,
	"source" "taxonomy_source" DEFAULT 'author' NOT NULL,
	"derivation_rule" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_taxonomy_values_exactly_one_value" CHECK (
        num_nonnulls(
          "recipe_taxonomy_values"."taxonomy_value_id",
          nullif(btrim("recipe_taxonomy_values"."custom_value"), '')
        ) = 1
      ),
	CONSTRAINT "recipe_taxonomy_values_custom_normalization_valid" CHECK (
        (
          "recipe_taxonomy_values"."custom_value" is null
          and "recipe_taxonomy_values"."normalized_custom_value" is null
        )
        or (
          nullif(btrim("recipe_taxonomy_values"."custom_value"), '') is not null
          and nullif(btrim("recipe_taxonomy_values"."normalized_custom_value"), '') is not null
        )
      ),
	CONSTRAINT "recipe_taxonomy_values_derivation_valid" CHECK (
        ("recipe_taxonomy_values"."source" <> 'derived' and "recipe_taxonomy_values"."derivation_rule" is null)
        or (
          "recipe_taxonomy_values"."source" = 'derived'
          and "recipe_taxonomy_values"."kind" = 'dietary'
          and nullif(btrim("recipe_taxonomy_values"."derivation_rule"), '') is not null
        )
      )
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "taxonomy_kind" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_values_id_kind_unique" UNIQUE("id","kind")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "unit_kind" NOT NULL,
	"name" text NOT NULL,
	"plural_name" text NOT NULL,
	"abbreviation" text,
	"normalized_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_slot_id_meal_plan_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meal_plan_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_generation_run_id_meal_plan_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."meal_plan_generation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_generation_runs" ADD CONSTRAINT "meal_plan_generation_runs_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_slots" ADD CONSTRAINT "meal_plan_slots_meal_plan_id_meal_plans_id_fk" FOREIGN KEY ("meal_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_section_recipe_fk" FOREIGN KEY ("section_id","recipe_id") REFERENCES "public"."recipe_ingredient_sections"("id","recipe_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient_sections" ADD CONSTRAINT "recipe_ingredient_sections_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_photos" ADD CONSTRAINT "recipe_photos_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_photos" ADD CONSTRAINT "recipe_photos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_taxonomy_values" ADD CONSTRAINT "recipe_taxonomy_values_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_taxonomy_values" ADD CONSTRAINT "recipe_taxonomy_values_canonical_kind_fk" FOREIGN KEY ("taxonomy_value_id","kind") REFERENCES "public"."taxonomy_values"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "meal_plans_owner_week_idx" ON "meal_plans" USING btree ("owner_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plan_entries_slot_unique" ON "meal_plan_entries" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "meal_plan_entries_recipe_id_idx" ON "meal_plan_entries" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "meal_plan_generation_runs_plan_created_idx" ON "meal_plan_generation_runs" USING btree ("meal_plan_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plan_slots_plan_date_position_unique" ON "meal_plan_slots" USING btree ("meal_plan_id","planned_date","position");--> statement-breakpoint
CREATE INDEX "meal_plan_slots_plan_date_idx" ON "meal_plan_slots" USING btree ("meal_plan_id","planned_date");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_slug_unique" ON "recipes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "recipes_owner_updated_idx" ON "recipes" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "recipes_status_published_idx" ON "recipes" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredients_section_position_unique" ON "recipe_ingredients" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_ingredient_id_idx" ON "recipe_ingredients" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredient_sections_recipe_position_unique" ON "recipe_ingredient_sections" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_photos_storage_key_unique" ON "recipe_photos" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_photos_recipe_position_unique" ON "recipe_photos" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_photos_one_primary_per_recipe" ON "recipe_photos" USING btree ("recipe_id") WHERE "recipe_photos"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_steps_recipe_position_unique" ON "recipe_steps" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_taxonomy_values_canonical_unique" ON "recipe_taxonomy_values" USING btree ("recipe_id","kind","taxonomy_value_id") WHERE "recipe_taxonomy_values"."taxonomy_value_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_taxonomy_values_custom_unique" ON "recipe_taxonomy_values" USING btree ("recipe_id","kind","normalized_custom_value") WHERE "recipe_taxonomy_values"."normalized_custom_value" is not null;--> statement-breakpoint
CREATE INDEX "recipe_taxonomy_values_filter_idx" ON "recipe_taxonomy_values" USING btree ("kind","taxonomy_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_normalized_name_unique" ON "ingredients" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_slug_unique" ON "ingredients" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ingredients_active_name_idx" ON "ingredients" USING btree ("is_active","name");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_values_kind_normalized_name_unique" ON "taxonomy_values" USING btree ("kind","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_values_kind_slug_unique" ON "taxonomy_values" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "taxonomy_values_kind_active_name_idx" ON "taxonomy_values" USING btree ("kind","is_active","name");--> statement-breakpoint
CREATE UNIQUE INDEX "units_normalized_name_unique" ON "units" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "units_active_name_idx" ON "units" USING btree ("is_active","name");
--> statement-breakpoint
CREATE INDEX "recipes_title_trgm_idx" ON "recipes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "recipes_search_document_idx" ON "recipes" USING gin (
  to_tsvector(
    'english'::regconfig,
    coalesce("title", '') || ' ' || coalesce("description", '')
  )
);--> statement-breakpoint
CREATE INDEX "ingredients_name_trgm_idx" ON "ingredients" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "taxonomy_values_name_trgm_idx" ON "taxonomy_values" USING gin ("name" gin_trgm_ops);
