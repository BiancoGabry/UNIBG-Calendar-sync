// Health of the service account credentials, kept in app_state so web and worker agree.
import type { Db } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import { errorMessage, isInvalidGrant } from "./errors";
import { serviceAccount } from "./service-account";

export const GOOGLE_STATUS_STATE = "googleStatus";

export type GoogleStatus = {
  status: "ok" | "invalid_credentials";
  message: string | null;
  at: string;
};

export function getGoogleStatus(db: Db): GoogleStatus | null {
  return repo.getState<GoogleStatus>(db, GOOGLE_STATUS_STATE) ?? null;
}

export function setGoogleStatus(db: Db, status: GoogleStatus["status"], message: string | null = null): void {
  repo.setState(db, GOOGLE_STATUS_STATE, { status, message, at: new Date().toISOString() } satisfies GoogleStatus);
}

/** Mints an access token with the service account key: proves the key is valid. */
export async function checkServiceAccount(): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const sa = serviceAccount();
    await sa.client.authorize();
    return { ok: true, email: sa.email };
  } catch (err) {
    return {
      ok: false,
      error: isInvalidGrant(err)
        ? "Google rifiuta la chiave del service account (invalid_grant): chiave eliminata o disattivata"
        : errorMessage(err),
    };
  }
}

/**
 * After the credentials were rejected: if they work again (e.g. new key + restart), resume
 * the configurations paused because of Google.
 */
export async function tryResumeGoogle(db: Db): Promise<boolean> {
  if (getGoogleStatus(db)?.status !== "invalid_credentials") return true;
  const check = await checkServiceAccount();
  if (!check.ok) return false;
  setGoogleStatus(db, "ok");
  for (const c of repo.listConfigs(db)) {
    if (c.status === "paused" && c.pauseReason === "google") {
      repo.updateConfig(db, c.id, { status: "active", pauseReason: null });
      repo.addLog(db, {
        configId: c.id,
        level: "info",
        kind: "google_ok",
        message: "Credenziali Google di nuovo valide: sincronizzazione ripresa",
      });
    }
  }
  return true;
}
