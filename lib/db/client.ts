import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { databasePath } from "@/lib/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const globalForDb = globalThis as unknown as { __unibgDb?: { db: Db; sqlite: Database.Database } };

export function openDb(url: string): { db: Db; sqlite: Database.Database } {
  const path = databasePath(url);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  // web and worker share the file: WAL + busy timeout avoid "database is locked".
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  return { db: drizzle(sqlite, { schema }), sqlite };
}

export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? join(process.cwd(), "drizzle");
}

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: migrationsFolder() });
}

/** Process-wide connection (survives Next.js dev hot reloads). */
export function getDb(): Db {
  if (!globalForDb.__unibgDb) {
    globalForDb.__unibgDb = openDb(process.env.DATABASE_URL ?? "file:./data/unibg.db");
    runMigrations(globalForDb.__unibgDb.db);
  }
  return globalForDb.__unibgDb.db;
}
