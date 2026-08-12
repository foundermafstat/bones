import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return drizzle(neon(databaseUrl), { schema });
}

export function getDatabase() {
  cached ??= createDatabase();
  return cached;
}
