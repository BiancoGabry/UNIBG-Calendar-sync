// Thin interface over Calendar API v3, so the sync logic can be tested with an
// in-memory fake. The real implementation uses the official @googleapis/calendar.
import { calendar, type calendar_v3 } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";
import type { EventBody } from "@/lib/sync/event";
import { errorStatus, isInvalidGrant, isRetryable, GoogleAuthRevokedError } from "./errors";
import { serviceAccount } from "./service-account";

export type GoogleEvent = calendar_v3.Schema$Event;

export type CalendarSummary = {
  id: string;
  summary: string;
  backgroundColor: string | null;
  accessRole: string;
  primary: boolean;
};

export interface CalendarApi {
  /** Calendars in the service account's calendarList with at least writer access. */
  listCalendars(): Promise<CalendarSummary[]>;
  /** calendarList.insert: adds a calendar shared with the service account to its list. */
  addCalendar(calendarId: string): Promise<CalendarSummary>;
  /** calendarList.get; null when the calendar is not (or no longer) in the list. */
  getCalendar(calendarId: string): Promise<CalendarSummary | null>;
  getEvent(calendarId: string, eventId: string): Promise<GoogleEvent | null>;
  /** With `eventId` null Google assigns the ID. Returns the ID of the created event. */
  insertEvent(calendarId: string, eventId: string | null, body: EventBody): Promise<string>;
  updateEvent(calendarId: string, eventId: string, body: EventBody): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  /** Events marked with every given private extended property (e.g. source=unibg-sync). */
  listByPrivateProperties(calendarId: string, props: Record<string, string>): Promise<GoogleEvent[]>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Exponential backoff on 403 rateLimitExceeded / 429 / 5xx; invalid_grant becomes GoogleAuthRevokedError. */
export async function withBackoff<T>(fn: () => Promise<T>, retries = 5, baseMs = 1000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isInvalidGrant(err)) throw new GoogleAuthRevokedError();
      if (attempt >= retries || !isRetryable(err)) throw err;
      await sleep(baseMs * 2 ** attempt + Math.floor(Math.random() * 250));
    }
  }
}

function summaryOf(c: calendar_v3.Schema$CalendarListEntry): CalendarSummary {
  return {
    id: c.id!,
    summary: c.summaryOverride ?? c.summary ?? c.id!,
    backgroundColor: c.backgroundColor ?? null,
    accessRole: c.accessRole ?? "",
    primary: c.primary === true,
  };
}

const isMissing = (err: unknown) => errorStatus(err) === 404 || errorStatus(err) === 410;

export function googleCalendarApi(auth: OAuth2Client): CalendarApi {
  const api = calendar({ version: "v3", auth });
  return {
    async listCalendars() {
      const out: CalendarSummary[] = [];
      let pageToken: string | undefined;
      do {
        const res = await withBackoff(() =>
          api.calendarList.list({ minAccessRole: "writer", maxResults: 250, pageToken, showHidden: true }),
        );
        for (const c of res.data.items ?? []) if (c.id) out.push(summaryOf(c));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    },

    async addCalendar(calendarId) {
      try {
        const res = await withBackoff(() => api.calendarList.insert({ requestBody: { id: calendarId } }));
        return summaryOf(res.data);
      } catch (err) {
        if (errorStatus(err) !== 409) throw err; // already in the list
        const res = await withBackoff(() => api.calendarList.get({ calendarId }));
        return summaryOf(res.data);
      }
    },

    async getCalendar(calendarId) {
      try {
        const res = await withBackoff(() => api.calendarList.get({ calendarId }));
        return summaryOf(res.data);
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    async getEvent(calendarId, eventId) {
      try {
        const res = await withBackoff(() => api.events.get({ calendarId, eventId }));
        return res.data;
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },

    async insertEvent(calendarId, eventId, body) {
      const res = await withBackoff(() =>
        api.events.insert({
          calendarId,
          requestBody: eventId ? { ...body, id: eventId } : body,
          sendUpdates: "none",
        }),
      );
      return res.data.id!;
    },

    async updateEvent(calendarId, eventId, body) {
      await withBackoff(() => api.events.update({ calendarId, eventId, requestBody: body, sendUpdates: "none" }));
    },

    async deleteEvent(calendarId, eventId) {
      await withBackoff(() => api.events.delete({ calendarId, eventId, sendUpdates: "none" }));
    },

    async listByPrivateProperties(calendarId, props) {
      const out: GoogleEvent[] = [];
      let pageToken: string | undefined;
      do {
        const res = await withBackoff(() =>
          api.events.list({
            calendarId,
            privateExtendedProperty: Object.entries(props).map(([k, v]) => `${k}=${v}`),
            showDeleted: false,
            maxResults: 2500,
            pageToken,
          }),
        );
        out.push(...(res.data.items ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    },
  };
}

/** Calendar API authenticated as the service account. */
export function serviceAccountCalendarApi(): CalendarApi {
  return googleCalendarApi(serviceAccount().client);
}
