import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { SnapshotEntry } from "@/lib/sync/types";
import type { Db } from "./client";
import { appState, easystaffCache, lessonSnapshot, syncConfig, syncLog, syncRun, type RunCounts } from "./schema";

export type SyncConfig = typeof syncConfig.$inferSelect;
export type NewSyncConfig = typeof syncConfig.$inferInsert;
export type SyncRun = typeof syncRun.$inferSelect;
export type SyncLogRow = typeof syncLog.$inferSelect;

const nowIso = () => new Date().toISOString();

// --- configs ---------------------------------------------------------------

export function listConfigs(db: Db): SyncConfig[] {
  return db.select().from(syncConfig).orderBy(syncConfig.createdAt).all();
}

export function getConfig(db: Db, id: string): SyncConfig | undefined {
  return db.select().from(syncConfig).where(eq(syncConfig.id, id)).get();
}

export function insertConfig(db: Db, values: NewSyncConfig): void {
  db.insert(syncConfig).values(values).run();
}

export function updateConfig(db: Db, id: string, patch: Partial<NewSyncConfig>): void {
  db.update(syncConfig)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(syncConfig.id, id))
    .run();
}

export function deleteConfig(db: Db, id: string): void {
  db.delete(syncConfig).where(eq(syncConfig.id, id)).run();
}

// --- snapshot --------------------------------------------------------------

export function loadSnapshot(db: Db, configId: string): SnapshotEntry[] {
  return db
    .select()
    .from(lessonSnapshot)
    .where(eq(lessonSnapshot.configId, configId))
    .all()
    .map((r) => ({
      sourceId: r.sourceId,
      googleEventId: r.googleEventId,
      contentHash: r.contentHash,
      eventHash: r.eventHash,
      status: r.status,
      lesson: r.lessonJson,
      cancelledAt: r.cancelledAt,
      removedAt: r.removedAt,
    }));
}

export function saveSnapshotEntry(db: Db, configId: string, e: SnapshotEntry): void {
  const now = nowIso();
  db.insert(lessonSnapshot)
    .values({
      configId,
      sourceId: e.sourceId,
      googleEventId: e.googleEventId,
      contentHash: e.contentHash,
      eventHash: e.eventHash,
      status: e.status,
      lessonJson: e.lesson,
      cancelledAt: e.cancelledAt,
      removedAt: e.removedAt,
      firstSeenAt: now,
      lastSeenAt: now,
      lastSyncedAt: now,
    })
    .onConflictDoUpdate({
      target: [lessonSnapshot.configId, lessonSnapshot.sourceId],
      set: {
        googleEventId: e.googleEventId,
        contentHash: e.contentHash,
        eventHash: e.eventHash,
        status: e.status,
        lessonJson: e.lesson,
        cancelledAt: e.cancelledAt,
        removedAt: e.removedAt,
        lastSyncedAt: now,
        ...(e.status === "removed" ? {} : { lastSeenAt: now }),
      },
    })
    .run();
}

export function deleteSnapshotEntry(db: Db, configId: string, sourceId: string): void {
  db.delete(lessonSnapshot)
    .where(and(eq(lessonSnapshot.configId, configId), eq(lessonSnapshot.sourceId, sourceId)))
    .run();
}

export function deleteSnapshot(db: Db, configId: string): void {
  db.delete(lessonSnapshot).where(eq(lessonSnapshot.configId, configId)).run();
}

export function touchSeen(db: Db, configId: string, sourceIds: string[]): void {
  const now = nowIso();
  for (let i = 0; i < sourceIds.length; i += 500) {
    db.update(lessonSnapshot)
      .set({ lastSeenAt: now })
      .where(and(eq(lessonSnapshot.configId, configId), inArray(lessonSnapshot.sourceId, sourceIds.slice(i, i + 500))))
      .run();
  }
}

// --- runs & log ------------------------------------------------------------

export function createRun(db: Db, configId: string, trigger: string, dryRun: boolean): number {
  const row = db
    .insert(syncRun)
    .values({ configId, trigger, dryRun, status: "running" })
    .returning({ id: syncRun.id })
    .get();
  return row.id;
}

export function updateRun(db: Db, id: number, patch: Partial<typeof syncRun.$inferInsert>): void {
  db.update(syncRun).set(patch).where(eq(syncRun.id, id)).run();
}

export function finishRun(
  db: Db,
  id: number,
  status: SyncRun["status"],
  counts: RunCounts,
  error: string | null = null,
): void {
  db.update(syncRun).set({ status, counts, error, finishedAt: nowIso() }).where(eq(syncRun.id, id)).run();
}

export function getRun(db: Db, id: number): SyncRun | undefined {
  return db.select().from(syncRun).where(eq(syncRun.id, id)).get();
}

export function lastRuns(db: Db, configId: string, limit = 10): SyncRun[] {
  return db.select().from(syncRun).where(eq(syncRun.configId, configId)).orderBy(desc(syncRun.id)).limit(limit).all();
}

export type LogInput = {
  configId: string | null;
  runId?: number | null;
  level: "info" | "warn" | "error";
  kind: string;
  message: string;
  lessonStart?: string | null;
  details?: Record<string, unknown> | null;
};

export function addLog(db: Db, entry: LogInput): void {
  db.insert(syncLog)
    .values({
      configId: entry.configId,
      runId: entry.runId ?? null,
      level: entry.level,
      kind: entry.kind,
      message: entry.message,
      lessonStart: entry.lessonStart ?? null,
      details: entry.details ?? null,
    })
    .run();
}

export function listLogs(db: Db, configId: string, limit = 100): SyncLogRow[] {
  return db.select().from(syncLog).where(eq(syncLog.configId, configId)).orderBy(desc(syncLog.id)).limit(limit).all();
}

export function logsSince(db: Db, configId: string, sinceIso: string): SyncLogRow[] {
  return db
    .select()
    .from(syncLog)
    .where(and(eq(syncLog.configId, configId), gte(syncLog.at, sinceIso)))
    .all();
}

// --- key/value & caches ----------------------------------------------------

export function getState<T>(db: Db, key: string): T | undefined {
  return db.select().from(appState).where(eq(appState.key, key)).get()?.value as T | undefined;
}

export function setState(db: Db, key: string, value: unknown): void {
  db.insert(appState)
    .values({ key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: nowIso() } })
    .run();
}

export function getCache(db: Db, key: string): { body: string; fetchedAt: string } | undefined {
  return db.select().from(easystaffCache).where(eq(easystaffCache.key, key)).get();
}

export function setCache(db: Db, key: string, body: string): void {
  const fetchedAt = nowIso();
  db.insert(easystaffCache)
    .values({ key, body, fetchedAt })
    .onConflictDoUpdate({ target: easystaffCache.key, set: { body, fetchedAt } })
    .run();
}
