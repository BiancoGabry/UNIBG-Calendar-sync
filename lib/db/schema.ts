import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { EventOptions } from "@/lib/sync/event";
import type { Lesson, SnapshotStatus } from "@/lib/sync/types";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** Raw combo.php payloads, cached 24 h. */
export const easystaffCache = sqliteTable("easystaff_cache", {
  key: text("key").primaryKey(),
  body: text("body").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export type CurriculumRef = { value: string; label: string };
export type PendingCourse = { code: string; name: string; required: boolean | null; firstSeenAt: string };

export const syncConfig = sqliteTable("sync_config", {
  id: text("id").primaryKey(), // 8 hex chars, part of every Google event ID
  name: text("name").notNull(),
  aa: text("aa").notNull(),
  aaLabel: text("aa_label").notNull(),
  courseCode: text("course_code").notNull(),
  courseLabel: text("course_label").notNull(),
  curricula: text("curricula", { mode: "json" }).$type<CurriculumRef[]>().notNull(),
  selectedCourses: text("selected_courses", { mode: "json" }).$type<string[]>().notNull(),
  excludedCourses: text("excluded_courses", { mode: "json" }).$type<string[]>().notNull(),
  pendingCourses: text("pending_courses", { mode: "json" })
    .$type<PendingCourse[]>()
    .notNull()
    .default(sql`'[]'`),
  seenCourses: text("seen_courses", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  surnameInitial: text("surname_initial").notNull().default(""),
  calendarId: text("calendar_id"),
  calendarName: text("calendar_name"),
  calendarColor: text("calendar_color"),
  options: text("options", { mode: "json" }).$type<EventOptions>().notNull(),
  status: text("status", { enum: ["draft", "active", "paused", "error"] })
    .notNull()
    .default("draft"),
  pauseReason: text("pause_reason"), // "user" | "google" | null
  consecutiveAnomalies: integer("consecutive_anomalies").notNull().default(0),
  lastAnomaly: text("last_anomaly"),
  lastRunAt: text("last_run_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  fileDate: text("file_date"),
  windowStart: text("window_start"),
  windowEnd: text("window_end"),
  periods: text("periods", { mode: "json" }).$type<{ year: string; label: string; start: string; end: string }[]>(),
  lastResponseCount: integer("last_response_count"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

export const lessonSnapshot = sqliteTable(
  "lesson_snapshot",
  {
    configId: text("config_id")
      .notNull()
      .references(() => syncConfig.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull(),
    googleEventId: text("google_event_id").notNull(),
    contentHash: text("content_hash").notNull(),
    eventHash: text("event_hash").notNull(),
    status: text("status").$type<SnapshotStatus>().notNull(),
    lessonJson: text("lesson_json", { mode: "json" }).$type<Lesson>().notNull(),
    cancelledAt: text("cancelled_at"),
    removedAt: text("removed_at"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.configId, t.sourceId] })],
);

export type RunCounts = Record<string, number>;

export const syncRun = sqliteTable(
  "sync_run",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    configId: text("config_id")
      .notNull()
      .references(() => syncConfig.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(), // "ui" | "worker" | "api" | "cli"
    dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["running", "ok", "partial", "anomaly", "error", "skipped"] }).notNull(),
    total: integer("total").notNull().default(0),
    done: integer("done").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    counts: text("counts", { mode: "json" }).$type<RunCounts>(),
    error: text("error"),
    startedAt: text("started_at").notNull().default(now),
    finishedAt: text("finished_at"),
  },
  (t) => [index("sync_run_config_idx").on(t.configId, t.id)],
);

export const syncLog = sqliteTable(
  "sync_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    configId: text("config_id").references(() => syncConfig.id, { onDelete: "cascade" }),
    runId: integer("run_id"),
    at: text("at").notNull().default(now),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    lessonStart: text("lesson_start"),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => [index("sync_log_config_idx").on(t.configId, t.id)],
);

export const lock = sqliteTable("lock", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: integer("expires_at").notNull(), // epoch ms
});

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: text("updated_at").notNull().default(now),
});
