// Actions → concrete Google operations (with rendered bodies and the snapshot to store
// once each operation succeeds). Pure.
import { isWanted } from "./diff";
import { renderEvent, type EventBody, type RenderContext } from "./event";
import { googleEventId } from "./ids";
import { describeAction } from "./messages";
import type { Action, Lesson, Selection, SnapshotEntry } from "./types";

export type PlannedOp =
  | {
      kind: "upsert";
      eventId: string;
      body: EventBody;
      /** Snapshot row to write after Google confirms. */
      next: SnapshotEntry;
      action: Action | { type: "refresh" };
      message: string | null;
    }
  | {
      kind: "delete";
      eventId: string;
      sourceId: string;
      action: Action;
      message: string | null;
    };

export type PlanInput = {
  actions: Action[];
  prev: SnapshotEntry[];
  current: Lesson[];
  selection: Selection;
  ctx: RenderContext;
  now: Date;
};

function upsert(
  state: Omit<SnapshotEntry, "googleEventId" | "contentHash" | "eventHash">,
  ctx: RenderContext,
  action: Action | { type: "refresh" },
  message: string | null,
): Extract<PlannedOp, { kind: "upsert" }> {
  const eventId = googleEventId(ctx.configId, state.sourceId);
  const { body, eventHash } = renderEvent(state, ctx);
  return {
    kind: "upsert",
    eventId,
    body,
    next: { ...state, googleEventId: eventId, contentHash: state.lesson.contentHash, eventHash },
    action,
    message,
  };
}

export function buildPlan(input: PlanInput): PlannedOp[] {
  const { ctx } = input;
  const nowIso = input.now.toISOString();
  const ops: PlannedOp[] = [];
  const touched = new Set<string>();

  for (const a of input.actions) {
    const message = describeAction(a);
    switch (a.type) {
      case "insert":
        touched.add(a.lesson.sourceId);
        ops.push(
          upsert(
            {
              sourceId: a.lesson.sourceId,
              lesson: a.lesson,
              status: a.lesson.cancelled ? "cancelled" : "active",
              cancelledAt: a.lesson.cancelled ? nowIso : null,
              removedAt: null,
            },
            ctx,
            a,
            message,
          ),
        );
        break;
      case "patch": {
        touched.add(a.lesson.sourceId);
        const cancelledAt = a.lesson.cancelled
          ? a.transition === "cancelled" || !a.prev.cancelledAt
            ? nowIso
            : a.prev.cancelledAt
          : null;
        ops.push(
          upsert(
            {
              sourceId: a.lesson.sourceId,
              lesson: a.lesson,
              status: a.lesson.cancelled ? "cancelled" : "active",
              cancelledAt,
              removedAt: null,
            },
            ctx,
            a,
            message,
          ),
        );
        break;
      }
      case "markRemoved":
        touched.add(a.prev.sourceId);
        ops.push(
          upsert(
            {
              sourceId: a.prev.sourceId,
              lesson: a.prev.lesson,
              status: "removed",
              cancelledAt: a.prev.cancelledAt,
              removedAt: nowIso,
            },
            ctx,
            a,
            message,
          ),
        );
        break;
      case "move":
        touched.add(a.prev.sourceId);
        touched.add(a.lesson.sourceId);
        ops.push({ kind: "delete", eventId: a.prev.googleEventId, sourceId: a.prev.sourceId, action: a, message });
        ops.push(
          upsert(
            {
              sourceId: a.lesson.sourceId,
              lesson: a.lesson,
              status: a.lesson.cancelled ? "cancelled" : "active",
              cancelledAt: a.lesson.cancelled ? nowIso : null,
              removedAt: null,
            },
            ctx,
            a,
            null,
          ),
        );
        break;
      case "delete":
        touched.add(a.prev.sourceId);
        ops.push({ kind: "delete", eventId: a.prev.googleEventId, sourceId: a.prev.sourceId, action: a, message });
        break;
    }
  }

  // Refresh: unchanged lessons whose rendered event differs from what was written
  // (event options changed, or the render format evolved). Future only.
  const currentById = new Map(input.current.map((l) => [l.sourceId, l]));
  const nowMs = input.now.getTime();
  for (const p of input.prev) {
    if (touched.has(p.sourceId) || Date.parse(p.lesson.end) <= nowMs) continue;
    const lesson = p.status === "removed" ? p.lesson : currentById.get(p.sourceId);
    if (!lesson || !isWanted(lesson, input.selection)) continue;
    const op = upsert(
      { sourceId: p.sourceId, lesson, status: p.status, cancelledAt: p.cancelledAt, removedAt: p.removedAt },
      ctx,
      { type: "refresh" },
      null,
    );
    if (op.next.eventHash !== p.eventHash) ops.push(op);
  }
  return ops;
}

export function summarizePlan(ops: PlannedOp[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const op of ops) {
    const key = op.action.type === "patch" && op.action.transition ? op.action.transition : op.action.type;
    // A move produces a delete + an upsert: count it once.
    if (op.action.type === "move" && op.kind === "upsert") continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
