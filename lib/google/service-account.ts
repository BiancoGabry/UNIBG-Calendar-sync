// Google access through a service account (JSON key). No user OAuth, no refresh token:
// the calendar is shared by hand with the service account's email.
import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";
import { z } from "zod";

/** Create / update / delete events on the shared calendar. */
export const SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events";
/** Needed by calendarList.insert / list (add the shared calendar to the service account's list). */
export const SCOPE_CALENDARLIST = "https://www.googleapis.com/auth/calendar.calendarlist";
export const SERVICE_ACCOUNT_SCOPES = [SCOPE_EVENTS, SCOPE_CALENDARLIST];

const keySchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
  private_key_id: z.string().optional(),
  project_id: z.string().optional(),
});

export type ServiceAccountKey = z.infer<typeof keySchema>;

export class ServiceAccountConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceAccountConfigError";
  }
}

/** Accepts the raw JSON or the same JSON base64-encoded (handy for a one-line env var). */
export function parseServiceAccountKey(raw: string, source: string): ServiceAccountKey {
  const trimmed = raw.trim();
  const text = trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ServiceAccountConfigError(`${source}: JSON non valido`);
  }
  const parsed = keySchema.safeParse(json);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ServiceAccountConfigError(`${source}: non è una chiave JSON di service account (campi: ${fields})`);
  }
  return parsed.data;
}

type KeySource = { GOOGLE_SERVICE_ACCOUNT_KEY_FILE?: string; GOOGLE_SERVICE_ACCOUNT_JSON?: string };

export function loadServiceAccountKey(
  e: KeySource = {
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  },
): ServiceAccountKey {
  if (e.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    let raw: string;
    try {
      raw = readFileSync(e.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8");
    } catch (err) {
      throw new ServiceAccountConfigError(
        `Impossibile leggere GOOGLE_SERVICE_ACCOUNT_KEY_FILE (${e.GOOGLE_SERVICE_ACCOUNT_KEY_FILE}): ${(err as Error).message}`,
      );
    }
    return parseServiceAccountKey(raw, "GOOGLE_SERVICE_ACCOUNT_KEY_FILE");
  }
  if (e.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountKey(e.GOOGLE_SERVICE_ACCOUNT_JSON, "GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  throw new ServiceAccountConfigError("Imposta GOOGLE_SERVICE_ACCOUNT_KEY_FILE oppure GOOGLE_SERVICE_ACCOUNT_JSON");
}

const globalForSa = globalThis as unknown as { __unibgSa?: { email: string; client: JWT } };

/** Process-wide JWT client; access tokens are minted and refreshed by google-auth-library. */
export function serviceAccount(): { email: string; client: JWT } {
  if (!globalForSa.__unibgSa) {
    const key = loadServiceAccountKey();
    globalForSa.__unibgSa = {
      email: key.client_email,
      client: new JWT({
        email: key.client_email,
        key: key.private_key,
        keyId: key.private_key_id,
        scopes: SERVICE_ACCOUNT_SCOPES,
      }),
    };
  }
  return globalForSa.__unibgSa;
}

export function serviceAccountEmail(): string | null {
  try {
    return serviceAccount().email;
  } catch {
    return null;
  }
}
