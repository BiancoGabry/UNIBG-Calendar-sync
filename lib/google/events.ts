// Robust upsert / guarded delete of the app's own events.
import { SOURCE_TAG, type EventBody } from "@/lib/sync/event";
import type { CalendarApi, GoogleEvent } from "./calendar-api";
import { errorStatus } from "./errors";

export class UnmarkedEventError extends Error {
  constructor(eventId: string) {
    super(`L'evento ${eventId} esiste ma non è marcato source=${SOURCE_TAG}: non lo tocco`);
    this.name = "UnmarkedEventError";
  }
}

export function isMarked(ev: GoogleEvent | null, configId?: string): boolean {
  const p = ev?.extendedProperties?.private;
  return p?.source === SOURCE_TAG && (configId === undefined || p?.configId === configId);
}

export type UpsertOutcome = "updated" | "inserted" | "revived";

/**
 * update (PUT, full body) → 404/410 → insert with the deterministic ID → 409 (ID already
 * used, also by an event deleted in the past) → update with status "confirmed" + full body.
 * PUT instead of PATCH: PATCH costs 3 quota units and cannot clear a field (e.g. the
 * cancelled colour) by omitting it; our body is always complete anyway.
 * With `expectNew` (lesson never synced) the insert is tried first, saving a 404 per event.
 */
export async function upsertEvent(
  api: CalendarApi,
  calendarId: string,
  eventId: string,
  body: EventBody,
  configId: string,
  opts: { expectNew?: boolean } = {},
): Promise<UpsertOutcome> {
  if (!opts.expectNew) {
    try {
      await api.updateEvent(calendarId, eventId, body);
      return "updated";
    } catch (err) {
      const status = errorStatus(err);
      if (status !== 404 && status !== 410) throw err;
    }
  }
  try {
    await api.insertEvent(calendarId, eventId, body);
    return "inserted";
  } catch (err) {
    if (errorStatus(err) !== 409) throw err;
  }
  const existing = await api.getEvent(calendarId, eventId);
  if (existing && existing.status !== "cancelled" && !isMarked(existing, configId)) {
    throw new UnmarkedEventError(eventId);
  }
  await api.updateEvent(calendarId, eventId, { ...body, status: "confirmed" });
  return "revived";
}

export type DeleteOutcome = "deleted" | "missing" | "skipped-unmarked";

/** Deletes only events marked source=unibg-sync for this config. */
export async function deleteMarkedEvent(
  api: CalendarApi,
  calendarId: string,
  eventId: string,
  configId: string,
): Promise<DeleteOutcome> {
  const existing = await api.getEvent(calendarId, eventId);
  if (!existing || existing.status === "cancelled") return "missing";
  if (!isMarked(existing, configId)) return "skipped-unmarked";
  try {
    await api.deleteEvent(calendarId, eventId);
    return "deleted";
  } catch (err) {
    const status = errorStatus(err);
    if (status === 404 || status === 410) return "missing";
    throw err;
  }
}

export function listMarkedEvents(api: CalendarApi, calendarId: string, configId: string): Promise<GoogleEvent[]> {
  return api.listByPrivateProperties(calendarId, { source: SOURCE_TAG, configId });
}
