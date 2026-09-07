-- Existing published rows have no snapshot in the preceding schema. Do not
-- silently expose their editable content or rewrite their status during upgrade.
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "recipes" WHERE "status" = 'published') THEN
		RAISE EXCEPTION 'Published recipes require reconciliation before publication snapshot migration';
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "recipe_publications" (
	"recipe_id" uuid PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"format_version" integer NOT NULL,
	"source_version" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recipe_publications_version_positive" CHECK ("recipe_publications"."source_version" > 0 and "recipe_publications"."format_version" > 0),
	CONSTRAINT "recipe_publications_snapshot_object" CHECK (jsonb_typeof("recipe_publications"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "recipe_publications" ADD CONSTRAINT "recipe_publications_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_publications_published_idx" ON "recipe_publications" USING btree ("published_at","recipe_id");
