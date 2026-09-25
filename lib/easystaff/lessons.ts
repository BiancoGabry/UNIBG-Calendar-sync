// Fetch lessons for a sync: one all_events=1 call; week-by-week only as a fallback.
import { addDays, startOfISOWeek } from "date-fns";
import { fetchGrid, type GridRequest } from "./grid";
import { EasyStaffClient, EasyStaffError } from "./http";
import { normalizeGrid, type NormalizedGrid } from "./normalize";

/**
 * all_events=1 returns the teaching period containing `date` plus every later published
 * period (or the whole year when `date` is past the last one), so `date = today` is
 * enough to pick up the next semester as soon as it is published.
 */
export async function fetchLessons(
  client: EasyStaffClient,
  req: Omit<GridRequest, "allEvents">,
  fallbackWindow?: { start: string; end: string } | null,
): Promise<NormalizedGrid & { mode: "all_events" | "weekly" }> {
  try {
    return { ...normalizeGrid(await fetchGrid(client, { ...req, allEvents: true })), mode: "all_events" };
  } catch (err) {
    const transport = err instanceof EasyStaffError && (err.kind === "network" || err.kind === "http");
    if (!transport || !fallbackWindow) throw err;
    return { ...(await fetchWeekly(client, req, fallbackWindow)), mode: "weekly" };
  }
}

/** Fallback: all_events=0, `date` advanced by 7 days, from this week to the end of the last known window. */
export async function fetchWeekly(
  client: EasyStaffClient,
  req: Omit<GridRequest, "allEvents">,
  window: { start: string; end: string },
): Promise<NormalizedGrid> {
  const today = typeof req.date === "string" ? new Date() : req.date;
  const from = startOfISOWeek(new Date(Math.max(today.getTime(), Date.parse(window.start))));
  const until = Date.parse(window.end);
  const parts: NormalizedGrid[] = [];
  for (let d = addDays(from, 3); d.getTime() < until + 7 * 86400_000 && parts.length < 30; d = addDays(d, 7)) {
    // `d` is a Thursday: safely inside the week whatever the timezone offset.
    parts.push(normalizeGrid(await fetchGrid(client, { ...req, date: d, allEvents: false })));
  }
  if (parts.length === 0) throw new EasyStaffError("http", "Fallback settimanale: nessuna settimana da scaricare");
  return mergeGrids(parts);
}

export function mergeGrids(parts: NormalizedGrid[]): NormalizedGrid {
  const [first] = parts;
  const lessons = new Map(parts.flatMap((p) => p.lessons.map((l) => [l.sourceId, l] as const)));
  const closures = new Map(parts.flatMap((p) => p.closures.map((c) => [`${c.start}|${c.name}`, c] as const)));
  const legend = new Map(parts.flatMap((p) => p.legend.map((l) => [l.code, l] as const)));
  const earliest = parts.reduce((a, b) => (Date.parse(b.window.start) < Date.parse(a.window.start) ? b : a));
  const latest = parts.reduce((a, b) => (Date.parse(b.window.end) > Date.parse(a.window.end) ? b : a));
  return {
    ...first,
    window: {
      start: earliest.window.start,
      firstDay: earliest.window.firstDay,
      end: latest.window.end,
      lastDay: latest.window.lastDay,
    },
    lessons: [...lessons.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    closures: [...closures.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    legend: [...legend.values()],
    warnings: parts.flatMap((p) => p.warnings),
  };
}
