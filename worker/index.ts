// Scheduler, separate from Next.js:
//   SYNC_CRON  (default */15 * * * *) → runSync for every active configuration
//   COMBO_CRON (default 0 6 * * *)    → reload combo.php (years, courses, periods)
// Overlaps are prevented by the DB lock also shared with POST /api/sync.
import cron from "node-cron";
import { getDb } from "@/lib/db/client";
import { setState } from "@/lib/db/repo";
import { env } from "@/lib/env";
import { serviceAccount } from "@/lib/google/service-account";
import { acquireLock, releaseLock } from "@/lib/lock";
import { logger } from "@/lib/log";
import { refreshCatalog } from "@/lib/sync/catalog-refresh";
import { runAllActive } from "@/lib/sync/run";
import { WORKER_STATE, type WorkerState } from "@/lib/worker-state";
import { isNightSkip, nextRunAfter } from "./schedule";

const e = env(); // fail fast on a bad .env
const { email: serviceAccountEmail } = serviceAccount(); // and on an unreadable key
const db = getDb(); // opens the DB and applies migrations

function heartbeat(nextRunAt: Date | null) {
  const state: WorkerState = {
    heartbeatAt: new Date().toISOString(),
    nextRunAt: nextRunAt?.toISOString() ?? null,
    cron: e.SYNC_CRON,
  };
  setState(db, WORKER_STATE, state);
}

async function syncTick() {
  const now = new Date();
  if (e.NIGHT_HOURLY && isNightSkip(now, e.TZ)) {
    heartbeat(nextRunAfter(syncTask, e));
    return;
  }
  const lock = acquireLock(db, "worker:sync-all", 30 * 60_000);
  if (!lock) return logger.warn("giro precedente ancora in corso: salto");
  try {
    const results = await runAllActive("worker");
    for (const [id, r] of Object.entries(results)) {
      logger.info(
        { configId: id, status: r.status, summary: r.summary, anomaly: r.anomaly?.message, error: r.error },
        "giro sync",
      );
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, "giro sync fallito");
  } finally {
    releaseLock(db, lock);
    heartbeat(nextRunAfter(syncTask, e));
  }
}

async function comboTick() {
  try {
    await refreshCatalog(db);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "refresh catalogo fallito");
  }
}

for (const [name, expr] of [
  ["SYNC_CRON", e.SYNC_CRON],
  ["COMBO_CRON", e.COMBO_CRON],
] as const) {
  if (!cron.validate(expr)) throw new Error(`${name} non valido: "${expr}"`);
}

const syncTask = cron.schedule(e.SYNC_CRON, syncTick, { timezone: e.TZ, noOverlap: true, name: "sync" });
cron.schedule(e.COMBO_CRON, comboTick, { timezone: e.TZ, noOverlap: true, name: "combo" });

logger.info(
  {
    sync: e.SYNC_CRON,
    combo: e.COMBO_CRON,
    nightHourly: e.NIGHT_HOURLY,
    tz: e.TZ,
    serviceAccount: serviceAccountEmail,
  },
  "worker avviato",
);
heartbeat(nextRunAfter(syncTask, e));
// First sync right away, so a restart does not wait up to 15 minutes.
void syncTick();

const shutdown = (signal: string) => {
  logger.info({ signal }, "worker in chiusura");
  cron.getTasks().forEach((t) => t.stop());
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
