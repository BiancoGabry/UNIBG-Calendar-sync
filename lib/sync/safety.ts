// Guards against false positives before a plan is applied. Pure.
import { isWanted } from "./diff";
import type { Lesson, Selection, SnapshotEntry, Window } from "./types";

export type FetchOutcome =
  | { ok: true; lessons: Lesson[]; window: Window }
  | { ok: false; kind: "network" | "http" | "parse" | "validation"; message: string };

export type AnomalyReason = "fetch_failed" | "validation_failed" | "empty_response" | "count_drop";

export type Anomaly = {
  reason: AnomalyReason;
  message: string;
  details?: Record<string, unknown>;
};

export type SafetyInput = {
  fetch: FetchOutcome;
  prev: SnapshotEntry[];
  /** Total lessons in the previous successful response, null on the first run. */
  prevResponseCount: number | null;
  selection: Selection;
  now: Date;
};

export const MAX_DROP_RATIO = 0.3;
/** Below this many expected lessons the ratio is too noisy (1 lesson out of 3 = 33 %). */
export const MIN_BASE_FOR_DROP = 10;

export function safetyCheck(input: SafetyInput): { ok: true } | { ok: false; anomaly: Anomaly } {
  const { fetch } = input;
  if (!fetch.ok) {
    const validation = fetch.kind === "validation" || fetch.kind === "parse";
    return {
      ok: false,
      anomaly: {
        reason: validation ? "validation_failed" : "fetch_failed",
        message: validation
          ? `Risposta EasyStaff non valida: ${fetch.message}`
          : `Impossibile scaricare l'orario: ${fetch.message}`,
      },
    };
  }

  if (fetch.lessons.length === 0 && (input.prevResponseCount ?? 0) > 0) {
    return {
      ok: false,
      anomaly: {
        reason: "empty_response",
        message: `EasyStaff ha restituito 0 lezioni (al giro precedente erano ${input.prevResponseCount})`,
        details: { prevResponseCount: input.prevResponseCount },
      },
    };
  }

  // Compare, at the same instant, the future lessons we expect (snapshot, still selected,
  // inside the new window) with the future lessons the response contains.
  const nowMs = input.now.getTime();
  const winStart = Date.parse(fetch.window.start);
  const winEnd = Date.parse(fetch.window.end);
  const expected = input.prev.filter(
    (e) =>
      e.status !== "removed" &&
      Date.parse(e.lesson.end) > nowMs &&
      Date.parse(e.lesson.start) >= winStart &&
      Date.parse(e.lesson.start) < winEnd &&
      isWanted(e.lesson, input.selection),
  ).length;
  const present = fetch.lessons.filter((l) => Date.parse(l.end) > nowMs && isWanted(l, input.selection)).length;

  if (expected > 0 && present === 0) {
    return {
      ok: false,
      anomaly: {
        reason: "empty_response",
        message: `Nessuna lezione futura per gli insegnamenti selezionati (ne erano attese ${expected})`,
        details: { expected, present },
      },
    };
  }
  if (expected >= MIN_BASE_FOR_DROP && (expected - present) / expected > MAX_DROP_RATIO) {
    const pct = Math.round(((expected - present) / expected) * 100);
    return {
      ok: false,
      anomaly: {
        reason: "count_drop",
        message: `Lezioni future scese da ${expected} a ${present} (−${pct}%)`,
        details: { expected, present },
      },
    };
  }
  return { ok: true };
}
