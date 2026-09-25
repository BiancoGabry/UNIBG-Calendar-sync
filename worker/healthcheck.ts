// Docker healthcheck for the worker: healthy if it wrote a heartbeat in the last 20 minutes.
import { openDb } from "@/lib/db/client";
import { getState } from "@/lib/db/repo";
import { WORKER_STATE, type WorkerState } from "@/lib/worker-state";

const { db } = openDb(process.env.DATABASE_URL ?? "file:./data/unibg.db");
const state = getState<WorkerState>(db, WORKER_STATE);
const fresh = state && Date.now() - Date.parse(state.heartbeatAt) < 20 * 60_000;
process.exit(fresh ? 0 : 1);
