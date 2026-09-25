"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearFailures, isLocked, recordFailure, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, safeNext, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";
import { logger } from "@/lib/log";

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (isLocked(ip)) return { error: "Troppi tentativi sbagliati: riprova tra 15 minuti" };

  const ok = await verifyPassword(String(form.get("password") ?? ""));
  if (!ok) {
    recordFailure(ip);
    logger.warn({ ip }, "login fallito");
    await new Promise((r) => setTimeout(r, 500));
    return { error: "Password errata" };
  }
  clearFailures(ip);

  const https = h.get("x-forwarded-proto") === "https" || (h.get("origin") ?? "").startsWith("https:");
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: https,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect(safeNext(form.get("next")));
}
