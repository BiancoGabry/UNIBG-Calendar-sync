import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCalendarAccess, connectCalendar } from "@/lib/google/calendars";
import { CalendarAccessError } from "@/lib/google/errors";
import {
  loadServiceAccountKey,
  parseServiceAccountKey,
  SERVICE_ACCOUNT_SCOPES,
  ServiceAccountConfigError,
} from "@/lib/google/service-account";
import { FakeCalendar } from "./fake-calendar";

const SA_EMAIL = "unibg-sync@progetto.iam.gserviceaccount.com";
const KEY = {
  type: "service_account",
  project_id: "progetto",
  private_key_id: "abc",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
  client_email: SA_EMAIL,
  client_id: "123",
};

describe("service account key", () => {
  it("parses raw JSON and base64 JSON", () => {
    expect(parseServiceAccountKey(JSON.stringify(KEY), "x").client_email).toBe(SA_EMAIL);
    const b64 = Buffer.from(JSON.stringify(KEY)).toString("base64");
    expect(parseServiceAccountKey(b64, "x").private_key).toContain("PRIVATE KEY");
  });

  it("reads the key file first, then the inline JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "sa-"));
    const file = join(dir, "key.json");
    writeFileSync(file, JSON.stringify({ ...KEY, client_email: "file@p.iam.gserviceaccount.com" }));
    expect(
      loadServiceAccountKey({ GOOGLE_SERVICE_ACCOUNT_KEY_FILE: file, GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(KEY) })
        .client_email,
    ).toBe("file@p.iam.gserviceaccount.com");
    expect(loadServiceAccountKey({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(KEY) }).client_email).toBe(SA_EMAIL);
  });

  it("rejects missing files, OAuth client JSON and garbage with a clear error", () => {
    expect(() => loadServiceAccountKey({ GOOGLE_SERVICE_ACCOUNT_KEY_FILE: "/nope/key.json" })).toThrow(
      /Impossibile leggere/,
    );
    expect(() => parseServiceAccountKey(JSON.stringify({ web: { client_id: "x" } }), "x")).toThrow(
      ServiceAccountConfigError,
    );
    expect(() => parseServiceAccountKey("{not json", "x")).toThrow(/JSON non valido/);
    expect(() => loadServiceAccountKey({})).toThrow(ServiceAccountConfigError);
  });

  it("asks only for events + calendarList scopes", () => {
    expect(SERVICE_ACCOUNT_SCOPES).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.calendarlist",
    ]);
  });
});

describe("connectCalendar", () => {
  it("adds the calendar to the calendarList and proves write access with a test event", async () => {
    const cal = new FakeCalendar();
    cal.shared.set("mio@group.calendar.google.com", "writer");
    const summary = await connectCalendar(cal, " mio@group.calendar.google.com ", SA_EMAIL);
    expect(summary).toMatchObject({ id: "mio@group.calendar.google.com", accessRole: "writer" });
    expect(cal.list.has("mio@group.calendar.google.com")).toBe(true);
    expect(cal.writes().map((c) => c.op)).toEqual(["insert", "delete"]);
    expect(cal.active()).toEqual([]); // the test event is gone
  });

  it("explains how to share when the calendar is not shared", async () => {
    const cal = new FakeCalendar();
    const err = await connectCalendar(cal, "altro@group.calendar.google.com", SA_EMAIL).catch((e) => e);
    expect(err).toBeInstanceOf(CalendarAccessError);
    expect(err.message).toContain(SA_EMAIL);
    expect(err.message).toContain("Apportare modifiche agli eventi");
  });

  it("refuses read-only sharing", async () => {
    const cal = new FakeCalendar();
    cal.shared.set("ro", "reader");
    await expect(connectCalendar(cal, "ro", SA_EMAIL)).rejects.toThrow(/solo accesso "reader"/);
    expect(cal.writes()).toEqual([]);
  });
});

describe("checkCalendarAccess", () => {
  it("re-adds a calendar missing from the list if it is still shared", async () => {
    const cal = new FakeCalendar();
    cal.list.delete("cal1");
    await expect(checkCalendarAccess(cal, "cal1", SA_EMAIL)).resolves.toBeUndefined();
    expect(cal.list.has("cal1")).toBe(true);
  });

  it("fails when sharing was removed", async () => {
    const cal = new FakeCalendar();
    cal.unshare("cal1");
    await expect(checkCalendarAccess(cal, "cal1", SA_EMAIL)).rejects.toBeInstanceOf(CalendarAccessError);
  });
});
