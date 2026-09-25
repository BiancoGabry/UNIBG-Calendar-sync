"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { serviceAccountCalendarApi, type CalendarSummary } from "@/lib/google/calendar-api";
import { connectCalendar } from "@/lib/google/calendars";
import { CalendarAccessError, errorMessage, GoogleAuthRevokedError } from "@/lib/google/errors";
import { serviceAccountEmail } from "@/lib/google/service-account";
import { checkServiceAccount, tryResumeGoogle } from "@/lib/google/status";
import { pauseForGoogle } from "@/lib/sync/run";
import type { ActionResult } from "./catalog";

export type CalendarsData = { calendars: CalendarSummary[]; serviceAccountEmail: string };

function googleFail(err: unknown): { ok: false; error: string } {
  if (err instanceof GoogleAuthRevokedError) {
    pauseForGoogle(getDb());
    return { ok: false, error: err.message };
  }
  if (err instanceof CalendarAccessError) return { ok: false, error: err.message };
  return { ok: false, error: errorMessage(err) };
}

/** Calendars in the service account's calendarList with write access (writer or owner). */
export async function listCalendarsAction(): Promise<ActionResult<CalendarsData>> {
  await requireSession();
  const email = serviceAccountEmail();
  if (!email) return { ok: false, error: "Chiave del service account non configurata o non valida" };
  try {
    const calendars = await serviceAccountCalendarApi().listCalendars();
    calendars.sort((a, b) => a.summary.localeCompare(b.summary, "it"));
    return {
      ok: true,
      data: {
        calendars: calendars.filter((c) => c.accessRole === "owner" || c.accessRole === "writer"),
        serviceAccountEmail: email,
      },
    };
  } catch (err) {
    return googleFail(err);
  }
}

/**
 * Adds a calendar shared with the service account (by ID) to its calendarList and verifies
 * write access with a test event created and deleted immediately.
 */
export async function connectCalendarAction(calendarId: string): Promise<ActionResult<CalendarSummary>> {
  await requireSession();
  const id = z.string().trim().min(3).max(512).safeParse(calendarId);
  if (!id.success) return { ok: false, error: "Incolla l'ID del calendario" };
  const email = serviceAccountEmail();
  if (!email) return { ok: false, error: "Chiave del service account non configurata o non valida" };
  try {
    return { ok: true, data: await connectCalendar(serviceAccountCalendarApi(), id.data, email) };
  } catch (err) {
    return googleFail(err);
  }
}

/** "Verifica credenziali": mints a token with the key and, if it works, resumes paused configs. */
export async function checkGoogleAction(): Promise<ActionResult<{ email: string }>> {
  await requireSession();
  const check = await checkServiceAccount();
  if (!check.ok) return { ok: false, error: check.error };
  await tryResumeGoogle(getDb());
  revalidatePath("/");
  return { ok: true, data: { email: check.email } };
}
