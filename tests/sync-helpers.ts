import { contentHash } from "@/lib/easystaff/normalize";
import { DEFAULT_EVENT_OPTIONS, renderEvent, type RenderContext } from "@/lib/sync/event";
import { googleEventId } from "@/lib/sync/ids";
import type { PlannedOp } from "@/lib/sync/plan";
import type { Lesson, LessonContent, Selection, SnapshotEntry } from "@/lib/sync/types";

export const CONFIG_ID = "0a1b2c3d";

export const CTX: RenderContext = {
  configId: CONFIG_ID,
  aa: "2026",
  portalBaseUrl: "https://logistica.unibg.it/PortaleStudenti/",
  options: DEFAULT_EVENT_OPTIONS,
};

export function lesson(overrides: Partial<Lesson> & { sourceId: string }): Lesson {
  const content: LessonContent = {
    courseCode: "EC172341",
    courseName: "FISICA I",
    title: "FISICA I",
    start: "2026-10-16T09:00:00+02:00",
    end: "2026-10-16T11:00:00+02:00",
    room: "D001 [Edificio D - Dalmine]",
    roomCode: "D001",
    site: "EDD-Dalmine",
    address: "Via Pasubio, 3, 24044 Dalmine BG",
    teacher: "Garattini Remo",
    kind: "Lezione",
    required: true,
    cancelled: false,
    notes: "",
  };
  const { sourceId, contentHash: _ignored, ...rest } = overrides;
  const merged = { ...content, ...rest };
  return { sourceId, ...merged, contentHash: contentHash(merged) };
}

export function entry(l: Lesson, overrides: Partial<SnapshotEntry> = {}): SnapshotEntry {
  const status = overrides.status ?? (l.cancelled ? "cancelled" : "active");
  const base = {
    sourceId: l.sourceId,
    lesson: l,
    status,
    cancelledAt: overrides.cancelledAt ?? (l.cancelled ? "2026-10-01T08:00:00.000Z" : null),
    removedAt: overrides.removedAt ?? null,
  };
  return {
    ...base,
    googleEventId: googleEventId(CONFIG_ID, l.sourceId),
    contentHash: l.contentHash,
    eventHash: renderEvent(base, CTX).eventHash,
    ...overrides,
  };
}

export const selectAll = (lessons: Lesson[], includeRecommended = true): Selection => ({
  courses: new Set(lessons.map((l) => l.courseCode)),
  includeRecommended,
});

/** Applies a plan to a snapshot as run.ts would after every successful Google call. */
export function applyPlan(prev: SnapshotEntry[], ops: PlannedOp[]): SnapshotEntry[] {
  const map = new Map(prev.map((e) => [e.sourceId, e]));
  for (const op of ops) {
    if (op.kind === "delete") map.delete(op.sourceId);
    else map.set(op.next.sourceId, op.next);
  }
  return [...map.values()];
}
