import "server-only";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import type { AcademicYear } from "@/lib/easystaff/combo";
import { serviceAccountEmail } from "@/lib/google/service-account";
import { getGoogleStatus } from "@/lib/google/status";
import { NEW_YEAR_DISMISSED_STATE, NEW_YEAR_STATE } from "@/lib/sync/catalog-refresh";
import { ANOMALY_BANNER_THRESHOLD } from "@/lib/sync/run";
import { WORKER_STATE, type WorkerState } from "@/lib/worker-state";

const CHANGE_KINDS = new Set(["patch", "cancelled", "restored", "reappeared", "markRemoved", "move", "insert"]);

export type ConfigOverview = {
  config: repo.SyncConfig;
  stats: { synced: number; cancelled: number; removed: number; changedLastWeek: number };
  lastRun: repo.SyncRun | null;
  showAnomalyBanner: boolean;
};

export function configOverview(id: string): ConfigOverview | null {
  const db = getDb();
  const config = repo.getConfig(db, id);
  if (!config) return null;
  const snapshot = repo.loadSnapshot(db, id);
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const changes = repo.logsSince(db, id, since).filter((l) => CHANGE_KINDS.has(l.kind) && l.kind !== "insert");
  return {
    config,
    stats: {
      synced: snapshot.length,
      cancelled: snapshot.filter((e) => e.status === "cancelled").length,
      removed: snapshot.filter((e) => e.status === "removed").length,
      changedLastWeek: changes.length,
    },
    lastRun: repo.lastRuns(db, id, 1)[0] ?? null,
    showAnomalyBanner: config.consecutiveAnomalies >= ANOMALY_BANNER_THRESHOLD,
  };
}

export function dashboardData() {
  const db = getDb();
  const status = getGoogleStatus(db);
  const newYear = repo.getState<AcademicYear | null>(db, NEW_YEAR_STATE) ?? null;
  const dismissed = repo.getState<string | null>(db, NEW_YEAR_DISMISSED_STATE) ?? null;
  const worker = repo.getState<WorkerState>(db, WORKER_STATE) ?? null;
  return {
    google: {
      email: serviceAccountEmail(),
      status: status?.status ?? "ok",
      message: status?.message ?? null,
    },
    newYear: newYear && newYear.value !== dismissed ? newYear : null,
    worker,
    workerAlive: worker ? Date.now() - Date.parse(worker.heartbeatAt) < 20 * 60_000 : false,
    configs: repo
      .listConfigs(db)
      .map((c) => configOverview(c.id))
      .filter((x): x is ConfigOverview => x !== null),
  };
}

export function configLogs(id: string, limit = 150) {
  return repo.listLogs(getDb(), id, limit);
}

export function configSnapshot(id: string) {
  return repo.loadSnapshot(getDb(), id);
}
