import { formatInTimeZone } from "date-fns-tz";

type TaskLike = { getNextRuns(count: number): Date[] };

/** Between 00:00 and 06:00 only the run at minute 0 goes ahead: timetables do not change at night. */
export function isNightSkip(date: Date, tz: string): boolean {
  const [h, m] = formatInTimeZone(date, tz, "H:m").split(":").map(Number);
  return h < 6 && m !== 0;
}

export function nextRunAfter(task: TaskLike, opts: { NIGHT_HOURLY: boolean; TZ: string }): Date | null {
  const runs = task.getNextRuns(12);
  return runs.find((d) => !opts.NIGHT_HOURLY || !isNightSkip(d, opts.TZ)) ?? runs[0] ?? null;
}
