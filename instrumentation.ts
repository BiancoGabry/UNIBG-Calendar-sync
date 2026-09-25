// Runs once when the Next.js server starts: validate .env and the service account key,
// apply Drizzle migrations.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./lib/env");
  const { getDb } = await import("./lib/db/client");
  const { logger } = await import("./lib/log");
  const { serviceAccount } = await import("./lib/google/service-account");
  env();
  const { email } = serviceAccount();
  getDb();
  logger.info({ serviceAccount: email }, "server avviato: configurazione valida, migrazioni applicate");
}
