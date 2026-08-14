import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const rootEnv = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const mode = process.argv[2] ?? "--check";
if (mode !== "--check" && mode !== "--apply") {
  throw new Error("Usage: pnpm db:check | pnpm db:migrate");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Put it in the repository root .env file.");
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
