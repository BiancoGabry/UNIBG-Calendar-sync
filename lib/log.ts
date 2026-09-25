import pino from "pino";

// Structured logs on stdout. Pretty output in development only if pino-pretty is piped.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "unibg-sync", proc: process.env.UNIBG_PROCESS ?? "web" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
