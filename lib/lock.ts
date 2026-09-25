// Cross-process lock stored in SQLite (web + worker share the DB file).
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/client";

export type LockHandle = { name: string; holder: string };

export function acquireLock(db: Db, name: string, ttlMs: number): LockHandle | null {
  const holder = randomUUID();
  const nowMs = Date.now();
  const sqlite = db.$client;
  const result = sqlite
    .prepare(
      `INSERT INTO lock (name, holder, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
       WHERE lock.expires_at < ?`,
    )
    .run(name, holder, nowMs + ttlMs, nowMs);
  return result.changes > 0 ? { name, holder } : null;
}

export function extendLock(db: Db, handle: LockHandle, ttlMs: number): void {
  db.$client
    .prepare(`UPDATE lock SET expires_at = ? WHERE name = ? AND holder = ?`)
    .run(Date.now() + ttlMs, handle.name, handle.holder);
}

export function releaseLock(db: Db, handle: LockHandle): void {
  db.$client.prepare(`DELETE FROM lock WHERE name = ? AND holder = ?`).run(handle.name, handle.holder);
}
