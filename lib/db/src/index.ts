import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "SUPABASE_DATABASE_URL or DATABASE_URL must be set.",
  );
}

const isSupabase = rawUrl.includes("supabase.com");

// Remove sslmode from URL when Supabase — pass ssl as object so rejectUnauthorized works
const connectionString = isSupabase
  ? rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/[?&]$/, "")
  : rawUrl;

export const pool = new Pool({
  connectionString,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
