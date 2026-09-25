// runSync(configId): the one entry point used by the UI, the worker and POST /api/sync.
// Does not depend on Next.js.
import { getDb, type Db } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import type { SyncConfig } from "@/lib/db/repo";
import type { PendingCourse } from "@/lib/db/schema";
import { EasyStaffError } from "@/lib/easystaff/http";
import { fetchLessons } from "@/lib/easystaff/lessons";
import type { NormalizedGrid } from "@/lib/easystaff/normalize";
import { easyStaffClient } from "@/lib/easystaff/service";
import { easyStaffEnv } from "@/lib/env";
import { serviceAccountCalendarApi, type CalendarApi, type GoogleEvent } from "@/lib/google/calendar-api";
import { checkCalendarAccess } from "@/lib/google/calendars";
import { deleteMarkedEvent, listMarkedEvents, upsertEvent } from "@/lib/google/events";
import { CalendarAccessError, errorMessage, GoogleAuthRevokedError } from "@/lib/google/errors";
import { serviceAccountEmail } from "@/lib/google/service-account";
import { setGoogleStatus, tryResumeGoogle } from "@/lib/google/status";
import { acquireLock, extendLock, releaseLock } from "@/lib/lock";
import { logger } from "@/lib/log";
import { diff } from "./diff";
import { buildPlan, summarizePlan, type PlannedOp } from "./plan";
import { safetyCheck, type Anomaly, type FetchOutcome } from "./safety";
import type { Lesson, Selection, SnapshotEntry } from "./types";

export type Trigger = "ui" | "worker" | "api" | "cli";

export type SyncDeps = {
  db: Db;
  fetchGrid: (config: SyncConfig, now: Date) => Promise<NormalizedGrid>;
  calendarApi: (db: Db) => CalendarApi;
  /** Service account email, used in "share the calendar with …" messages. */
  accountEmail: () => string;
  portalBaseUrl: string;
  batchSize: number;
  batchPauseMs: number;
  now: () => Date;
};

export type RunOptions = {
  trigger: Trigger;
  dryRun?: boolean;
  /** Apply the plan even if safetyCheck reports an anomaly (explicit user choice). */
  force?: boolean;
  onRunCreated?: (runId: number) => void;
};

export type PlanPreviewItem = { kind: string; message: string; start: string | null; eventId: string };

export type RunResult = {
  runId: number | null;
  status: "ok" | "partial" | "anomaly" | "error" | "skipped";
  dryRun: boolean;
  summary: Record<string, number>;
  plan: PlanPreviewItem[];
  anomaly?: Anomaly;
  error?: string;
};

export const ANOMALY_BANNER_THRESHOLD = 3;
const LOCK_TTL_MS = 15 * 60_000;

export function defaultDeps(db: Db): SyncDeps {
  const e = easyStaffEnv();
  return {
    db,
    fetchGrid: (config, now) =>
      fetchLessons(
        easyStaffClient(),
        { aa: config.aa, course: config.courseCode, curricula: config.curricula, date: now },
        config.windowStart && config.windowEnd ? { start: config.windowStart, end: config.windowEnd } : null,
      ),
    calendarApi: () => serviceAccountCalendarApi(),
    accountEmail: () => serviceAccountEmail() ?? "il service account",
    portalBaseUrl: e.EASYSTAFF_BASE_URL,
    batchSize: 50,
    batchPauseMs: 1000,
    now: () => new Date(),
  };
}

export function selectionOf(config: SyncConfig): Selection {
  return { courses: new Set(config.selectedCourses), includeRecommended: config.options.includeRecommended };
}

function previewOf(ops: PlannedOp[]): PlanPreviewItem[] {
  return ops.map((op) => ({
    kind: op.action.type === "patch" && op.action.transition ? op.action.transition : op.action.type,
    message:
      op.message ??
      (op.kind === "upsert" ? `${op.body.summary} – aggiornamento formato evento` : `Eliminazione ${op.eventId}`),
    start: op.kind === "upsert" ? op.body.start.dateTime : null,
    eventId: op.eventId,
  }));
}

/** Rebuilds a snapshot from events marked on Google (e.g. after the DB was lost). */
export function snapshotFromEvents(events: GoogleEvent[]): SnapshotEntry[] {
  const out: SnapshotEntry[] = [];
  for (const ev of events) {
    const p = ev.extendedProperties?.private;
    const start = ev.start?.dateTime;
    const end = ev.end?.dateTime;
    if (!ev.id || !p?.sourceId || !p.contentHash || !start || !end) continue;
    const summary = ev.summary ?? "";
    const status = summary.startsWith("⚠️ RIMOSSA")
      ? "removed"
      : summary.startsWith("❌ ANNULLATA")
        ? "cancelled"
        : "active";
    const title = summary.replace(/^(⚠️ RIMOSSA|❌ ANNULLATA) – /, "").replace(/^\[[^\]]+\] /, "");
    const lesson: Lesson = {
      sourceId: p.sourceId,
      courseCode: p.courseCode ?? "",
      courseName: title,
      title,
      start,
      end,
      room: ev.location ?? "",
      roomCode: "",
      site: "",
      address: "",
      teacher: "",
      kind: "",
      required: true,
      cancelled: status === "cancelled",
      notes: "",
      contentHash: p.contentHash,
    };
    out.push({
      sourceId: p.sourceId,
      googleEventId: ev.id,
      contentHash: p.contentHash,
      eventHash: "", // unknown: forces one refresh if the lesson is still there
      status,
      lesson,
      cancelledAt: null,
      removedAt: null,
    });
  }
  return out;
}

function updatePending(
  config: SyncConfig,
  grid: NormalizedGrid,
  nowIso: string,
): { pending: PendingCourse[]; added: PendingCourse[]; seen: string[]; newlyPublished: string[] } {
  const known = new Set([
    ...config.selectedCourses,
    ...config.excludedCourses,
    ...config.pendingCourses.map((p) => p.code),
  ]);
  const added: PendingCourse[] = [];
  for (const l of grid.legend) {
    if (known.has(l.code)) continue;
    known.add(l.code);
    added.push({ code: l.code, name: l.name, required: l.required, firstSeenAt: nowIso });
  }
  const withLessons = new Set(grid.lessons.map((l) => l.courseCode));
  const seen = new Set(config.seenCourses);
  const newlyPublished = config.selectedCourses.filter((c) => withLessons.has(c) && !seen.has(c));
  for (const c of withLessons) if (config.selectedCourses.includes(c)) seen.add(c);
  return { pending: [...config.pendingCourses, ...added], added, seen: [...seen], newlyPublished };
}

export async function runSync(configId: string, opts: RunOptions, deps?: SyncDeps): Promise<RunResult> {
  const d = deps ?? defaultDeps(getDb());
  const { db } = d;
  const dryRun = opts.dryRun === true;
  const base: RunResult = { runId: null, status: "skipped", dryRun, summary: {}, plan: [] };
  const log = logger.child({ configId, trigger: opts.trigger, dryRun });

  const config = repo.getConfig(db, configId);
  if (!config) return { ...base, status: "error", error: `Configurazione ${configId} inesistente` };
  if (!dryRun) {
    if (config.status === "draft") return { ...base, error: "Configurazione non ancora attivata" };
    if (config.status === "paused" && opts.trigger === "worker") return { ...base, error: "Sincronizzazione in pausa" };
    if (!config.calendarId) return { ...base, status: "error", error: "Nessun calendario Google scelto" };
  }

  const lock = dryRun ? null : acquireLock(db, `sync:${configId}`, LOCK_TTL_MS);
  if (!dryRun && !lock) return { ...base, error: "Sincronizzazione già in corso" };

  const runId = repo.createRun(db, configId, opts.trigger, dryRun);
  opts.onRunCreated?.(runId);
  const now = d.now();
  const nowIso = now.toISOString();
  const addLog = (entry: Omit<repo.LogInput, "configId" | "runId">) => {
    if (!dryRun) repo.addLog(db, { configId, runId, ...entry });
  };

  try {
    // 1. Fetch + validate
    let fetch: FetchOutcome;
    let grid: NormalizedGrid | null = null;
    try {
      grid = await d.fetchGrid(config, now);
      fetch = { ok: true, lessons: grid.lessons, window: { start: grid.window.start, end: grid.window.end } };
      for (const w of grid.warnings.slice(0, 5)) log.warn({ warning: w }, "normalizzazione");
    } catch (err) {
      const kind = err instanceof EasyStaffError ? err.kind : "network";
      fetch = { ok: false, kind, message: (err as Error).message };
      log.warn({ err: (err as Error).message, details: (err as EasyStaffError).details }, "fetch EasyStaff fallita");
    }

    const selection = selectionOf(config);
    let prev = repo.loadSnapshot(db, configId);

    // The calendar must still be shared with the service account, with write access.
    const api = !dryRun && config.calendarId ? d.calendarApi(db) : null;
    if (api) await checkCalendarAccess(api, config.calendarId!, d.accountEmail());

    // 2. First real run on an empty DB: rebuild state from events already marked on Google.
    if (api && prev.length === 0 && !config.lastSuccessAt) {
      const events = await listMarkedEvents(api, config.calendarId!, configId);
      if (events.length > 0) {
        prev = snapshotFromEvents(events);
        addLog({
          level: "info",
          kind: "reconcile",
          message: `Stato ricostruito da Google: ${prev.length} eventi già presenti`,
        });
      }
    }

    // 3. Safety
    const safety = safetyCheck({ fetch, prev, prevResponseCount: config.lastResponseCount, selection, now });
    if (!safety.ok && (!fetch.ok || !opts.force)) {
      const anomaly = safety.anomaly;
      if (!dryRun) {
        const count = config.consecutiveAnomalies + 1;
        repo.updateConfig(db, configId, {
          consecutiveAnomalies: count,
          lastAnomaly: anomaly.message,
          lastRunAt: nowIso,
        });
        addLog({
          level: "warn",
          kind: "anomaly",
          message: `${anomaly.message}. Nessuna modifica applicata, riprovo al prossimo giro.`,
          details: anomaly.details ?? null,
        });
      }
      if (!grid || !dryRun) {
        repo.finishRun(db, runId, "anomaly", {}, anomaly.message);
        return { ...base, runId, status: "anomaly", anomaly };
      }
      // dry-run: still show what would happen
      const actions = diff(prev, grid.lessons, now, { selection, window: fetch.ok ? fetch.window : null });
      const ops = buildPlan({ actions, prev, current: grid.lessons, selection, ctx: renderCtx(config, d), now });
      repo.finishRun(db, runId, "anomaly", summarizePlan(ops), anomaly.message);
      return { ...base, runId, status: "anomaly", anomaly, summary: summarizePlan(ops), plan: previewOf(ops) };
    }
    if (!safety.ok && opts.force) {
      addLog({
        level: "warn",
        kind: "anomaly_forced",
        message: `Anomalia ignorata su richiesta: ${safety.anomaly.message}`,
      });
    }
    grid = grid!;

    // 4. New / newly published teachings
    const pending = updatePending(config, grid, nowIso);
    for (const p of pending.added) {
      addLog({
        level: "info",
        kind: "new_course",
        message: `Nuovo insegnamento disponibile: ${p.name} (${p.code}) – da approvare`,
      });
    }
    if (config.seenCourses.length > 0) {
      for (const code of pending.newlyPublished) {
        const name = grid.legend.find((l) => l.code === code)?.name ?? code;
        addLog({
          level: "info",
          kind: "course_published",
          message: `${name}: orario pubblicato, sincronizzazione automatica`,
        });
      }
    }

    // 5. Diff + plan
    const actions = diff(prev, grid.lessons, now, { selection, window: fetch.ok ? fetch.window : null });
    const ops = buildPlan({ actions, prev, current: grid.lessons, selection, ctx: renderCtx(config, d), now });
    const summary = summarizePlan(ops);
    const configPatch = {
      fileDate: grid.fileDate,
      windowStart: grid.window.start,
      windowEnd: grid.window.end,
      periods: grid.periods.length ? grid.periods : config.periods,
      lastResponseCount: grid.lessons.length,
      pendingCourses: pending.pending,
      seenCourses: pending.seen,
    };

    if (dryRun) {
      repo.finishRun(db, runId, "ok", summary);
      return { ...base, runId, status: "ok", summary, plan: previewOf(ops) };
    }

    // 6. Apply, sequentially, updating the snapshot only after Google confirms.
    repo.updateRun(db, runId, { total: ops.length });
    let done = 0;
    let failed = 0;
    let refreshed = 0;
    let revoked = false;
    for (const op of ops) {
      try {
        if (op.kind === "upsert") {
          await upsertEvent(api!, config.calendarId!, op.eventId, op.body, configId, {
            expectNew: op.action.type === "insert" || op.action.type === "move",
          });
          repo.saveSnapshotEntry(db, configId, op.next);
          if (op.action.type === "refresh") refreshed++;
        } else {
          const outcome = await deleteMarkedEvent(api!, config.calendarId!, op.eventId, configId);
          if (outcome === "skipped-unmarked") {
            addLog({ level: "warn", kind: "skip", message: `Evento ${op.eventId} non marcato: non eliminato` });
          }
          repo.deleteSnapshotEntry(db, configId, op.sourceId);
        }
        if (op.message) {
          addLog({
            level: "info",
            kind: op.action.type === "patch" && op.action.transition ? op.action.transition : op.action.type,
            message: op.message,
            lessonStart: op.kind === "upsert" ? op.body.start.dateTime : null,
          });
        }
        done++;
      } catch (err) {
        if (err instanceof GoogleAuthRevokedError) {
          revoked = true;
          break;
        }
        failed++;
        addLog({
          level: "error",
          kind: "google_error",
          message: `${op.message ?? op.eventId}: ${errorMessage(err)} (riprovo al prossimo giro)`,
        });
      }
      repo.updateRun(db, runId, { done, failed });
      if ((done + failed) % d.batchSize === 0) {
        extendLock(db, lock!, LOCK_TTL_MS);
        if (d.batchPauseMs > 0) await new Promise((r) => setTimeout(r, d.batchPauseMs));
      }
    }
    if (refreshed > 0) {
      addLog({
        level: "info",
        kind: "refresh",
        message: `${refreshed} eventi riscritti per il cambio delle opzioni evento`,
      });
    }

    const currentIds = new Set(grid.lessons.map((l) => l.sourceId));
    repo.touchSeen(
      db,
      configId,
      repo
        .loadSnapshot(db, configId)
        .filter((e) => currentIds.has(e.sourceId))
        .map((e) => e.sourceId),
    );

    if (revoked) {
      pauseForGoogle(db, configId);
      repo.updateConfig(db, configId, { ...configPatch, lastRunAt: nowIso });
      repo.finishRun(db, runId, "error", summary, "invalid_grant");
      return { ...base, runId, status: "error", summary, error: new GoogleAuthRevokedError().message };
    }

    const status = failed > 0 ? "partial" : "ok";
    repo.updateConfig(db, configId, {
      ...configPatch,
      lastRunAt: nowIso,
      ...(failed === 0
        ? { lastSuccessAt: nowIso, lastError: null }
        : { lastError: `${failed} operazioni non riuscite` }),
      consecutiveAnomalies: 0,
      lastAnomaly: null,
      ...(config.status === "error" ? { status: "active" as const } : {}),
    });
    repo.finishRun(db, runId, status, summary);
    log.info({ summary, done, failed }, "sync completata");
    return { ...base, runId, status, summary, plan: previewOf(ops) };
  } catch (err) {
    if (err instanceof GoogleAuthRevokedError) pauseForGoogle(db, configId);
    const message = errorMessage(err);
    log.error({ err: message }, "sync fallita");
    if (!dryRun) {
      repo.updateConfig(db, configId, {
        lastRunAt: nowIso,
        lastError: message,
        // Calendar no longer shared: flag it; the worker keeps retrying and recovers by itself.
        ...(err instanceof CalendarAccessError && config.status === "active" ? { status: "error" as const } : {}),
      });
      // Same error every 15 minutes: log it once.
      if (message !== config.lastError) {
        repo.addLog(db, {
          configId,
          runId,
          level: "error",
          kind: err instanceof CalendarAccessError ? "calendar_access" : "error",
          message: `Sincronizzazione fallita: ${message}`,
        });
      }
    }
    repo.finishRun(db, runId, "error", {}, message);
    return { ...base, runId, status: "error", error: message };
  } finally {
    if (lock) releaseLock(db, lock);
  }
}

function renderCtx(config: SyncConfig, d: SyncDeps) {
  return { configId: config.id, aa: config.aa, portalBaseUrl: d.portalBaseUrl, options: config.options };
}

export function pauseForGoogle(db: Db, configId?: string): void {
  setGoogleStatus(db, "invalid_credentials", new GoogleAuthRevokedError().message);
  // The service account is shared by every config: pause them all.
  for (const c of repo.listConfigs(db)) {
    if (c.status === "active" || c.status === "error") {
      repo.updateConfig(db, c.id, { status: "paused", pauseReason: "google" });
    }
  }
  repo.addLog(db, {
    configId: configId ?? null,
    level: "error",
    kind: "google_revoked",
    message:
      "Google ha rifiutato le credenziali del service account: sincronizzazione in pausa. Sostituisci la chiave JSON e riavvia web e worker.",
  });
}

/** Runs every active config sequentially (worker, POST /api/sync). "error" configs are retried too. */
export async function runAllActive(trigger: Trigger, deps?: SyncDeps): Promise<Record<string, RunResult>> {
  const d = deps ?? defaultDeps(getDb());
  if (!deps) await tryResumeGoogle(d.db).catch(() => false);
  const out: Record<string, RunResult> = {};
  for (const c of repo.listConfigs(d.db).filter((c) => c.status === "active" || c.status === "error")) {
    out[c.id] = await runSync(c.id, { trigger }, d);
  }
  return out;
}

/** "Disattiva e rimuovi eventi creati": deletes every event marked with this configId. */
export async function teardown(configId: string, deps?: SyncDeps): Promise<{ deleted: number; skipped: number }> {
  const d = deps ?? defaultDeps(getDb());
  const config = repo.getConfig(d.db, configId);
  if (!config) throw new Error(`Configurazione ${configId} inesistente`);
  const lock = acquireLock(d.db, `sync:${configId}`, LOCK_TTL_MS);
  if (!lock) throw new Error("Sincronizzazione in corso: riprova tra poco");
  try {
    repo.updateConfig(d.db, configId, { status: "paused", pauseReason: "user" });
    let deleted = 0;
    let skipped = 0;
    if (config.calendarId) {
      const api = d.calendarApi(d.db);
      const events = await listMarkedEvents(api, config.calendarId, configId);
      const ids = new Set([
        ...events.map((e) => e.id!),
        ...repo.loadSnapshot(d.db, configId).map((e) => e.googleEventId),
      ]);
      for (const id of ids) {
        const outcome = await deleteMarkedEvent(api, config.calendarId, id, configId);
        if (outcome === "deleted") deleted++;
        if (outcome === "skipped-unmarked") skipped++;
      }
    }
    repo.deleteSnapshot(d.db, configId);
    repo.updateConfig(d.db, configId, { status: "draft", pauseReason: null, lastSuccessAt: null, seenCourses: [] });
    repo.addLog(d.db, {
      configId,
      level: "info",
      kind: "teardown",
      message: `Sincronizzazione disattivata: ${deleted} eventi eliminati dal calendario${skipped ? ` (${skipped} non marcati ignorati)` : ""}`,
    });
    return { deleted, skipped };
  } finally {
    releaseLock(d.db, lock);
  }
}
