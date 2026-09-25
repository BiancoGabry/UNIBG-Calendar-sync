// Connecting the calendar shared with the service account, and checking it stays writable.
import { TZ } from "@/lib/easystaff/time";
import { SOURCE_TAG, type EventBody } from "@/lib/sync/event";
import type { CalendarApi, CalendarSummary } from "./calendar-api";
import { CalendarAccessError, errorStatus } from "./errors";

const WRITABLE = new Set(["writer", "owner"]);

export function shareHint(serviceAccountEmail: string): string {
  return `Condividi il calendario con ${serviceAccountEmail} con il permesso "Apportare modifiche agli eventi".`;
}

function accessError(err: unknown, calendarId: string, email: string): Error {
  const status = errorStatus(err);
  if (status === 404) {
    return new CalendarAccessError(`Calendario "${calendarId}" non trovato o non condiviso. ${shareHint(email)}`);
  }
  if (status === 403) return new CalendarAccessError(`Accesso negato al calendario. ${shareHint(email)}`);
  if (status === 400) return new CalendarAccessError(`ID calendario non valido: "${calendarId}"`);
  return err as Error;
}

/** Test write: an invisible event (1 January 2000, no reminders) created and deleted straight away. */
export async function verifyWriteAccess(api: CalendarApi, calendarId: string): Promise<void> {
  const body: EventBody = {
    summary: "unibg-sync: verifica accesso in scrittura",
    description: "Evento di prova creato e cancellato subito da unibg-sync.",
    start: { dateTime: "2000-01-01T00:00:00+01:00", timeZone: TZ },
    end: { dateTime: "2000-01-01T00:01:00+01:00", timeZone: TZ },
    transparency: "transparent",
    status: "confirmed",
    reminders: { useDefault: false, overrides: [] },
    source: { title: "unibg-sync", url: "https://logistica.unibg.it/PortaleStudenti/" },
    extendedProperties: { private: { source: SOURCE_TAG, kind: "write-test" } },
  };
  const id = await api.insertEvent(calendarId, null, body);
  await api.deleteEvent(calendarId, id);
}

/**
 * Adds the calendar to the service account's calendarList and proves write access with a
 * test event. Throws CalendarAccessError with instructions when the calendar is not shared
 * or shared read-only.
 */
export async function connectCalendar(api: CalendarApi, calendarId: string, email: string): Promise<CalendarSummary> {
  const id = calendarId.trim();
  let cal: CalendarSummary;
  try {
    cal = await api.addCalendar(id);
  } catch (err) {
    throw accessError(err, id, email);
  }
  if (!WRITABLE.has(cal.accessRole)) {
    throw new CalendarAccessError(`Il service account ha solo accesso "${cal.accessRole}". ${shareHint(email)}`);
  }
  try {
    await verifyWriteAccess(api, id);
  } catch (err) {
    throw accessError(err, id, email);
  }
  return cal;
}

/** Pre-flight check before writing: the calendar must still be shared with write access. */
export async function checkCalendarAccess(api: CalendarApi, calendarId: string, email: string): Promise<void> {
  let cal = await api.getCalendar(calendarId);
  if (!cal) {
    // Not in the list any more: re-adding it succeeds only if it is still shared.
    try {
      cal = await api.addCalendar(calendarId);
    } catch (err) {
      throw accessError(err, calendarId, email);
    }
  }
  if (!WRITABLE.has(cal.accessRole)) {
    throw new CalendarAccessError(
      `Il service account non può più modificare "${cal.summary}" (accesso "${cal.accessRole}"). ${shareHint(email)}`,
    );
  }
}
