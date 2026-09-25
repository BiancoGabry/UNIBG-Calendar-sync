// Pure diff between the last synced snapshot and the current lessons. No I/O.
import { romeIsoWeek } from "@/lib/easystaff/time";
import * as f from "./format";
import type { Action, FieldChange, Lesson, Selection, SnapshotEntry, Window } from "./types";

export type DiffOptions = {
  selection: Selection;
  /** Range covered by the current response. Lessons outside it are never marked removed. */
  window: Window | null;
};

export function isWanted(lesson: Lesson, selection: Selection): boolean {
  return selection.courses.has(lesson.courseCode) && (selection.includeRecommended || lesson.required);
}

const ms = (iso: string) => Date.parse(iso);
const duration = (l: Lesson) => ms(l.end) - ms(l.start);

export function fieldChanges(prev: Lesson, next: Lesson): FieldChange[] {
  const out: FieldChange[] = [];
  const push = (field: FieldChange["field"], from: string, to: string) => {
    if (from !== to) out.push({ field, from, to });
  };
  push("title", prev.title, next.title);
  push("courseName", prev.courseName, next.courseName);
  push("date", f.dayShort(prev.start), f.dayShort(next.start));
  push("time", f.timeRange(prev.start, prev.end), f.timeRange(next.start, next.end));
  push("room", prev.roomCode || prev.room, next.roomCode || next.room);
  if (prev.room === next.room) push("address", prev.address, next.address);
  push("teacher", prev.teacher, next.teacher);
  push("kind", prev.kind, next.kind);
  push("required", prev.required ? "obbligatorio" : "consigliato", next.required ? "obbligatorio" : "consigliato");
  push("notes", prev.notes, next.notes);
  return out;
}

/**
 * diff(prevSnapshot, currentLessons, now) → actions.
 *
 * - new lesson (cancelled or not)             → insert
 * - contentHash changed                       → patch (+ field changes)
 * - Annullato 0→1 / 1→0                       → patch with transition cancelled / restored
 * - lesson back after being marked removed    → patch with transition reappeared
 * - lesson gone, inside the covered window    → markRemoved, or move when a new lesson of the
 *                                               same teaching, same ISO week and same duration appears
 * - lesson no longer selected                 → delete
 * - lesson already ended                      → nothing, the past is never touched
 */
export function diff(prev: SnapshotEntry[], current: Lesson[], now: Date, opts: DiffOptions): Action[] {
  const nowMs = now.getTime();
  const isFuture = (l: Lesson) => ms(l.end) > nowMs;
  const wanted = (l: Lesson) => isWanted(l, opts.selection);

  const prevById = new Map(prev.map((e) => [e.sourceId, e]));
  const currentById = new Map(current.map((l) => [l.sourceId, l]));

  const actions: Action[] = [];
  const inserts: Lesson[] = [];

  for (const lesson of currentById.values()) {
    if (!wanted(lesson) || !isFuture(lesson)) continue;
    const p = prevById.get(lesson.sourceId);
    if (!p) {
      inserts.push(lesson);
      continue;
    }
    const wasCancelled = p.status === "cancelled" || (p.status === "removed" && p.lesson.cancelled);
    const transition =
      p.status === "removed"
        ? "reappeared"
        : lesson.cancelled && !wasCancelled
          ? "cancelled"
          : !lesson.cancelled && wasCancelled
            ? "restored"
            : null;
    if (transition || p.contentHash !== lesson.contentHash) {
      actions.push({ type: "patch", lesson, prev: p, changes: fieldChanges(p.lesson, lesson), transition });
    }
  }

  const removals: SnapshotEntry[] = [];
  for (const p of prev) {
    if (!isFuture(p.lesson)) continue;
    const cur = currentById.get(p.sourceId);
    if (!wanted(cur ?? p.lesson)) {
      actions.push({ type: "delete", prev: p, reason: "deselected" });
      continue;
    }
    if (cur || p.status === "removed") continue;
    if (!opts.window || ms(p.lesson.start) < ms(opts.window.start) || ms(p.lesson.start) >= ms(opts.window.end)) {
      continue; // outside what the response covers: absence means nothing
    }
    removals.push(p);
  }

  // "Move" heuristic: EasyStaff may give a rescheduled lesson a new id.
  const matched = new Set<Lesson>();
  for (const r of removals) {
    const candidates = inserts.filter(
      (l) =>
        !matched.has(l) &&
        l.courseCode === r.lesson.courseCode &&
        romeIsoWeek(l.start) === romeIsoWeek(r.lesson.start) &&
        duration(l) === duration(r.lesson),
    );
    candidates.sort((a, b) => Math.abs(ms(a.start) - ms(r.lesson.start)) - Math.abs(ms(b.start) - ms(r.lesson.start)));
    const target = candidates[0];
    if (target) {
      matched.add(target);
      actions.push({ type: "move", prev: r, lesson: target });
    } else {
      actions.push({ type: "markRemoved", prev: r });
    }
  }
  for (const l of inserts) if (!matched.has(l)) actions.push({ type: "insert", lesson: l });

  return actions.sort((a, b) => ms(actionStart(a)) - ms(actionStart(b)) || actionKey(a).localeCompare(actionKey(b)));
}

export function actionStart(a: Action): string {
  return a.type === "insert" || a.type === "patch" || a.type === "move" ? a.lesson.start : a.prev.lesson.start;
}

function actionKey(a: Action): string {
  return `${a.type}:${a.type === "insert" ? a.lesson.sourceId : a.prev.sourceId}`;
}
