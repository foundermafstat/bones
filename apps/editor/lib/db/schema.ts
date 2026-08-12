import type { RigProject } from "@bones/schema";
import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const bonesOwners = pgTable("bones_owners", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerKey: text("owner_key").notNull().unique(),
  displayName: text("display_name").notNull().default("Local owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const bonesProjects = pgTable("bones_projects", {
  id: text("id").primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => bonesOwners.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  sourceJson: jsonb("source_json").$type<RigProject>().notNull(),
  sourceHash: text("source_hash").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("bones_projects_owner_updated_idx").on(table.ownerId, table.updatedAt)]);

export const bonesProjectRevisions = pgTable("bones_project_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: text("project_id").notNull().references(() => bonesProjects.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  kind: text("kind").notNull(),
  label: text("label"),
  sourceJson: jsonb("source_json").$type<RigProject>().notNull(),
  sourceHash: text("source_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique("bones_project_revision_number_unique").on(table.projectId, table.revisionNumber),
  index("bones_project_revisions_project_created_idx").on(table.projectId, table.createdAt)
]);

export const bonesProjectAssets = pgTable("bones_project_assets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => bonesProjects.id, { onDelete: "cascade" }),
  relativePath: text("relative_path").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  checksum: text("checksum").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  unique("bones_project_asset_path_unique").on(table.projectId, table.relativePath),
  index("bones_project_assets_project_idx").on(table.projectId)
]);

export type BonesProjectRow = typeof bonesProjects.$inferSelect;
export type BonesAssetRow = typeof bonesProjectAssets.$inferSelect;
