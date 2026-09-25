// Helpers to read errors thrown by google-auth-library / googleapis-common (gaxios).

type AnyErr = {
  status?: number;
  code?: number | string;
  message?: string;
  errors?: { reason?: string }[];
  response?: { status?: number; data?: { error?: unknown; error_description?: string } };
};

export function errorStatus(err: unknown): number | undefined {
  const e = err as AnyErr;
  const s = e?.status ?? e?.response?.status ?? (typeof e?.code === "number" ? e.code : Number(e?.code));
  return Number.isFinite(s) ? Number(s) : undefined;
}

export function errorReason(err: unknown): string | undefined {
  const e = err as AnyErr;
  const data = e?.response?.data?.error as { errors?: { reason?: string }[] } | undefined;
  return e?.errors?.[0]?.reason ?? data?.errors?.[0]?.reason;
}

/** Service account key rejected by Google (deleted/disabled key, wrong clock, deleted account). */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as AnyErr;
  const dataError = e?.response?.data?.error;
  return dataError === "invalid_grant" || /invalid_grant/.test(e?.message ?? "");
}

export function isRateLimit(err: unknown): boolean {
  const status = errorStatus(err);
  const reason = errorReason(err);
  return status === 429 || (status === 403 && (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded"));
}

export function isRetryable(err: unknown): boolean {
  const status = errorStatus(err);
  return isRateLimit(err) || (status !== undefined && status >= 500);
}

export function errorMessage(err: unknown): string {
  const e = err as AnyErr;
  const status = errorStatus(err);
  return `${status ? `[${status}] ` : ""}${e?.message ?? String(err)}`;
}

export class GoogleAuthRevokedError extends Error {
  constructor() {
    super(
      "Credenziali del service account rifiutate da Google (invalid_grant): chiave eliminata o disattivata, oppure service account rimosso",
    );
    this.name = "GoogleAuthRevokedError";
  }
}

/** The configured calendar is not shared (anymore) with the service account, or not with write access. */
export class CalendarAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarAccessError";
  }
}
