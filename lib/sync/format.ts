import { formatInTimeZone } from "date-fns-tz";
import { it } from "date-fns/locale";
import { TZ } from "@/lib/easystaff/time";

const fmt = (iso: string | Date, pattern: string) => formatInTimeZone(iso, TZ, pattern, { locale: it });

/** "ven 16/10 09:00" */
export const dayTime = (iso: string) => fmt(iso, "EEE dd/MM HH:mm");
/** "ven 16/10" */
export const dayShort = (iso: string) => fmt(iso, "EEE dd/MM");
/** "09:00" */
export const time = (iso: string) => fmt(iso, "HH:mm");
/** "25/09/2026 19:40" */
export const dateTime = (iso: string | Date) => fmt(iso, "dd/MM/yyyy HH:mm");
/** "16/10/2026" */
export const date = (iso: string | Date) => fmt(iso, "dd/MM/yyyy");
/** "09:00–11:00" */
export const timeRange = (start: string, end: string) => `${time(start)}–${time(end)}`;
