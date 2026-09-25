import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TZ = "Europe/Rome";

const ISO_WITH_OFFSET = "yyyy-MM-dd'T'HH:mm:ssXXX";

/** "15-09-2026" → "2026-09-15" */
export function ddmmyyyyToIsoDate(d: string): string {
  const [dd, mm, yyyy] = d.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Local Europe/Rome wall time → Date. "24:00" means midnight at the end of the day.
 * Handles DST: 25-10-2026 09:00 is +01:00, 24-10-2026 09:00 is +02:00.
 */
export function romeDate(ddmmyyyy: string, hhmm: string): Date {
  const isoDate = ddmmyyyyToIsoDate(ddmmyyyy);
  if (hhmm === "24:00") {
    // Next calendar day at local midnight (not "+24 h", which is wrong on DST days).
    const next = addDays(new Date(`${isoDate}T12:00:00Z`), 1)
      .toISOString()
      .slice(0, 10);
    return fromZonedTime(`${next}T00:00:00`, TZ);
  }
  return fromZonedTime(`${isoDate}T${hhmm}:00`, TZ);
}

/** Date → "2026-09-15T09:00:00+02:00" in Europe/Rome. */
export function toRomeIso(date: Date | number): string {
  return formatInTimeZone(date, TZ, ISO_WITH_OFFSET);
}

export function romeIso(ddmmyyyy: string, hhmm: string): string {
  return toRomeIso(romeDate(ddmmyyyy, hhmm));
}

/** ISO week key in Europe/Rome, e.g. "2026-W42". */
export function romeIsoWeek(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, "RRRR-'W'II");
}

export function romeDay(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, "yyyy-MM-dd");
}
