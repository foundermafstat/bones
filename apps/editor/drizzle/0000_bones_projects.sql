CREATE TABLE IF NOT EXISTS "bones_owners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_key" text NOT NULL,
  "display_name" text NOT NULL DEFAULT 'Local owner',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bones_owners_owner_key_unique" UNIQUE("owner_key")
);

CREATE TABLE IF NOT EXISTS "bones_projects" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "bones_owners"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "source_json" jsonb NOT NULL,
  "source_hash" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "bones_projects_owner_updated_idx"
  ON "bones_projects" ("owner_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "bones_project_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" text NOT NULL REFERENCES "bones_projects"("id") ON DELETE CASCADE,
  "revision_number" integer NOT NULL,
  "kind" text NOT NULL,
  "label" text,
  "source_json" jsonb NOT NULL,
  "source_hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bones_project_revision_number_unique" UNIQUE("project_id", "revision_number")
);

CREATE INDEX IF NOT EXISTS "bones_project_revisions_project_created_idx"
  ON "bones_project_revisions" ("project_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "bones_project_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "bones_projects"("id") ON DELETE CASCADE,
  "relative_path" text NOT NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "checksum" text NOT NULL,
  "width" integer,
  "height" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bones_project_asset_path_unique" UNIQUE("project_id", "relative_path")
);

CREATE INDEX IF NOT EXISTS "bones_project_assets_project_idx"
  ON "bones_project_assets" ("project_id");
