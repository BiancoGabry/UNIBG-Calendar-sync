// Date helpers for the preview (runs in the browser; always Europe/Rome).
import { formatInTimeZone } from "date-fns-tz";
import { it } from "date-fns/locale";

export const TZ = "Europe/Rome";

export const romeDayKey = (iso: string) => formatInTimeZone(iso, TZ, "yyyy-MM-dd");
export const romeTime = (iso: string) => formatInTimeZone(iso, TZ, "HH:mm");
export const romeMinutes = (iso: string) => {
  const [h, m] = romeTime(iso).split(":").map(Number);
  return h * 60 + m;
};

const utc = (day: string) => new Date(`${day}T12:00:00Z`);
const key = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysKey(day: string, n: number): string {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return key(d);
}

/** Monday of the week containing `day` (yyyy-MM-dd). */
export function mondayOf(day: string): string {
  const dow = (utc(day).getUTCDay() + 6) % 7; // 0 = Monday
  return addDaysKey(day, -dow);
}

export function dayLabel(day: string, pattern = "EEE d MMM"): string {
  return formatInTimeZone(utc(day), "UTC", pattern, { locale: it });
}

export function todayKey(): string {
  return romeDayKey(new Date().toISOString());
}
