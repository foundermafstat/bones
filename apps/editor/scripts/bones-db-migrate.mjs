import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const mode = process.argv[2] ?? "--check";
if (mode !== "--check" && mode !== "--apply") {
  throw new Error("Usage: pnpm db:check | pnpm db:migrate");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Put the rotated Neon URL in apps/editor/.env.local and export it for this command.");
}

const migrationUrl = new URL("../drizzle/0000_bones_projects.sql", import.meta.url);
const migrationSql = await readFile(fileURLToPath(migrationUrl), "utf8");
const sql = neon(databaseUrl);
const expectedTables = ["bones_owners", "bones_projects", "bones_project_revisions", "bones_project_assets"];
const existingRows = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = ANY(${expectedTables})
  ORDER BY table_name
`;
const existing = new Set(existingRows.map((row) => row.table_name));
const missing = expectedTables.filter((table) => !existing.has(table));

console.log(`Bones DB preflight: ${existing.size}/${expectedTables.length} tables already exist.`);
if (!missing.length) {
  console.log("SQL diff: no missing Bones tables.");
  process.exit(0);
}

console.log(`SQL diff: create ${missing.join(", ")} plus their Bones-only indexes and constraints.`);
console.log(migrationSql);

if (mode === "--apply") {
  const statements = migrationSql.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean);
  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log("Applied Bones-only migration 0000_bones_projects.sql.");
}
