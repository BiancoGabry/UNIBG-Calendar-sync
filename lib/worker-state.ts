/** Heartbeat written by the worker, read by the dashboard (next run, worker alive). */
export const WORKER_STATE = "worker";
export type WorkerState = { heartbeatAt: string; nextRunAt: string | null; cron: string };
