// In-memory Calendar API used only by tests. Models the calendar ACL (what is shared with
// the service account), the service account's calendarList and the events of one calendar.
import type { CalendarApi, CalendarSummary, GoogleEvent } from "@/lib/google/calendar-api";
import type { EventBody } from "@/lib/sync/event";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly response?: { status: number; data: { error: string } },
  ) {
    super(message);
  }
}

export class FakeCalendar implements CalendarApi {
  events = new Map<string, GoogleEvent>();
  calls: { op: string; eventId?: string }[] = [];
  failNext: ((op: string, eventId?: string) => Error | null) | null = null;
  /** Calendars shared with the service account → access role ("writer", "reader", ...). */
  shared = new Map<string, string>([["cal1", "writer"]]);
  /** The service account's calendarList. */
  list = new Set<string>(["cal1"]);
  private seq = 0;

  writes() {
    return this.calls.filter((c) => ["insert", "update", "delete"].includes(c.op));
  }

  private check(op: string, eventId?: string) {
    this.calls.push({ op, eventId });
    const err = this.failNext?.(op, eventId);
    if (err) throw err;
  }

  private requireWriter(calendarId: string) {
    const role = this.shared.get(calendarId);
    if (!role) throw new HttpError(404, "Not Found");
    if (role !== "writer" && role !== "owner") throw new HttpError(403, "Forbidden");
  }

  private summary(id: string): CalendarSummary {
    return {
      id,
      summary: `Calendario ${id}`,
      backgroundColor: "#123456",
      accessRole: this.shared.get(id)!,
      primary: false,
    };
  }

  static invalidGrant() {
    return new HttpError(400, "invalid_grant", { status: 400, data: { error: "invalid_grant" } });
  }

  unshare(calendarId: string) {
    this.shared.delete(calendarId);
    this.list.delete(calendarId); // Google drops the calendar from the grantee's list
  }

  async listCalendars() {
    this.check("listCalendars");
    return [...this.list]
      .filter((id) => ["writer", "owner"].includes(this.shared.get(id) ?? ""))
      .map((id) => this.summary(id));
  }

  async addCalendar(calendarId: string) {
    this.check("addCalendar");
    if (!this.shared.has(calendarId)) throw new HttpError(404, "Not Found");
    this.list.add(calendarId);
    return this.summary(calendarId);
  }

  async getCalendar(calendarId: string) {
    this.check("getCalendar");
    return this.list.has(calendarId) && this.shared.has(calendarId) ? this.summary(calendarId) : null;
  }

  async getEvent(cal: string, eventId: string) {
    this.check("get", eventId);
    this.requireWriter(cal);
    return this.events.get(eventId) ?? null;
  }

  async insertEvent(cal: string, eventId: string | null, body: EventBody) {
    this.check("insert", eventId ?? undefined);
    this.requireWriter(cal);
    const id = eventId ?? `auto${++this.seq}`;
    if (this.events.has(id)) throw new HttpError(409, "The requested identifier already exists.");
    this.events.set(id, { ...body, id });
    return id;
  }

  async updateEvent(cal: string, eventId: string, body: EventBody) {
    this.check("update", eventId);
    this.requireWriter(cal);
    if (!this.events.has(eventId)) throw new HttpError(404, "Not Found");
    this.events.set(eventId, { ...body, id: eventId });
  }

  async deleteEvent(cal: string, eventId: string) {
    this.check("delete", eventId);
    this.requireWriter(cal);
    const ev = this.events.get(eventId);
    if (!ev || ev.status === "cancelled") throw new HttpError(410, "Resource has been deleted");
    this.events.set(eventId, { ...ev, status: "cancelled" }); // Google keeps deleted events
  }

  async listByPrivateProperties(cal: string, props: Record<string, string>) {
    this.check("list");
    this.requireWriter(cal);
    return [...this.events.values()].filter(
      (e) =>
        e.status !== "cancelled" && Object.entries(props).every(([k, v]) => e.extendedProperties?.private?.[k] === v),
    );
  }

  active() {
    return [...this.events.values()].filter((e) => e.status !== "cancelled");
  }
}
