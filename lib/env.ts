import { z } from "zod";

const envSchema = z
  .object({
    EASYSTAFF_BASE_URL: z.url().default("https://logistica.unibg.it/PortaleStudenti/"),
    EASYSTAFF_USER_AGENT: z.string().default("unibg-calendar-sync/1.0 (+self-hosted, uso personale)"),
    /** Path of the service account JSON key (preferred: keep it out of the repo, mount it in Docker). */
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().min(1).optional(),
    /** Alternative: the whole JSON key inline (raw or base64). */
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
    /** UI password: plain text, or a bcrypt hash ($2a$/$2b$/$2y$). */
    APP_PASSWORD: z.string().min(8, "almeno 8 caratteri"),
    SESSION_SECRET: z.string().min(32, "almeno 32 caratteri"),
    CRON_SECRET: z.string().min(16, "almeno 16 caratteri"),
    DATABASE_URL: z.string().default("file:./data/unibg.db"),
    SYNC_CRON: z.string().default("*/15 * * * *"),
    COMBO_CRON: z.string().default("0 6 * * *"),
    /** Between 00:00 and 06:00 sync only once per hour. */
    NIGHT_HOURLY: z
      .enum(["true", "false", "1", "0"])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
    TZ: z.string().default("Europe/Rome"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .refine((e) => e.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || e.GOOGLE_SERVICE_ACCOUNT_JSON, {
    message: "serve GOOGLE_SERVICE_ACCOUNT_KEY_FILE oppure GOOGLE_SERVICE_ACCOUNT_JSON",
    path: ["GOOGLE_SERVICE_ACCOUNT_KEY_FILE"],
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validated environment. Throws a readable error listing every invalid variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configurazione .env non valida:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

const easyStaffSchema = z.object({
  EASYSTAFF_BASE_URL: z.url().default("https://logistica.unibg.it/PortaleStudenti/"),
  EASYSTAFF_USER_AGENT: z.string().default("unibg-calendar-sync/1.0 (+self-hosted, uso personale)"),
  DATABASE_URL: z.string().default("file:./data/unibg.db"),
});

/** Only the variables needed to read EasyStaff and the DB (CLI / dry-run without Google). */
export function easyStaffEnv(): z.infer<typeof easyStaffSchema> {
  return easyStaffSchema.parse(process.env);
}

export function databasePath(url: string): string {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}
