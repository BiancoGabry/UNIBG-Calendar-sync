import { describe, expect, it } from "vitest";
import { parseGridResponse } from "@/lib/easystaff/grid";
import { normalizeGrid } from "@/lib/easystaff/normalize";
import { diff } from "@/lib/sync/diff";
import { CANCELLED_COLOR, REMOVED_COLOR, renderEvent } from "@/lib/sync/event";
import { EVENT_ID_RE, googleEventId, newConfigId } from "@/lib/sync/ids";
import { buildPlan, summarizePlan } from "@/lib/sync/plan";
import type { Lesson, SnapshotEntry } from "@/lib/sync/types";
import { fixture, GRID_2026 } from "./helpers";
import { applyPlan, CONFIG_ID, CTX, entry, lesson, selectAll } from "./sync-helpers";

const NOW = new Date("2026-09-25T20:00:00+02:00");
const grid = normalizeGrid(parseGridResponse(fixture(GRID_2026)));
const selection = selectAll(grid.lessons);

function run(prev: SnapshotEntry[], current: Lesson[], now = NOW, ctx = CTX) {
  const actions = diff(prev, current, now, { selection, window: grid.window });
  const ops = buildPlan({ actions, prev, current, selection, ctx, now });
  return { actions, ops, next: applyPlan(prev, ops) };
}

describe("event IDs", () => {
  it("are valid base32hex, deterministic and unique", () => {
    const id = googleEventId(CONFIG_ID, "919167");
    expect(id).toBe("unibg0a1b2c3ds919167");
    expect(id).toMatch(EVENT_ID_RE);
    expect(googleEventId(CONFIG_ID, "919167")).toBe(id);
    const ids = grid.lessons.map((l) => googleEventId(CONFIG_ID, l.sourceId));
    expect(new Set(ids).size).toBe(grid.lessons.length);
    expect(ids.every((i) => EVENT_ID_RE.test(i))).toBe(true);
  });

  it("encodes unexpected source ids and rejects bad config ids", () => {
    expect(googleEventId(CONFIG_ID, "AB-1")).toMatch(EVENT_ID_RE);
    expect(() => googleEventId("XYZ", "1")).toThrow();
    for (let i = 0; i < 50; i++) expect(googleEventId(newConfigId(), "1")).toMatch(EVENT_ID_RE);
  });

  it("the separator is not 'x' (outside base32hex)", () => {
    expect("unibgx1").not.toMatch(/^[a-v0-9]+$/);
  });
});

describe("plan", () => {
  it("first sync inserts every future lesson, including cancelled ones", () => {
    const { ops } = run([], grid.lessons);
    const future = grid.lessons.filter((l) => Date.parse(l.end) > NOW.getTime());
    expect(ops).toHaveLength(future.length);
    expect(ops.every((o) => o.kind === "upsert" && o.action.type === "insert")).toBe(true);
    expect(summarizePlan(ops)).toEqual({ insert: future.length });
  });

  it("is idempotent: a second run with no changes writes nothing", () => {
    const first = run([], grid.lessons);
    const second = run(first.next, grid.lessons);
    expect(second.actions).toEqual([]);
    expect(second.ops).toEqual([]);
    // Also later in time (lessons ending in between are simply skipped).
    expect(run(first.next, grid.lessons, new Date("2026-11-02T12:00:00+01:00")).ops).toEqual([]);
  });

  it("changing event options re-renders future events once", () => {
    const first = run([], grid.lessons);
    const ctx = { ...CTX, options: { ...CTX.options, reminder: { mode: "minutes" as const, minutes: 15 } } };
    const refresh = run(first.next, grid.lessons, NOW, ctx);
    expect(refresh.ops.length).toBe(first.ops.length);
    expect(refresh.ops.every((o) => o.action.type === "refresh")).toBe(true);
    expect(run(refresh.next, grid.lessons, NOW, ctx).ops).toEqual([]);
  });

  it("move = delete old event + insert new one", () => {
    const a = lesson({ sourceId: "1" });
    const moved = lesson({ sourceId: "2", start: "2026-10-15T09:00:00+02:00", end: "2026-10-15T11:00:00+02:00" });
    const actions = diff([entry(a)], [moved], NOW, { selection: selectAll([a]), window: grid.window });
    const ops = buildPlan({
      actions,
      prev: [entry(a)],
      current: [moved],
      selection: selectAll([a]),
      ctx: CTX,
      now: NOW,
    });
    expect(ops.map((o) => [o.kind, o.eventId])).toEqual([
      ["delete", googleEventId(CONFIG_ID, "1")],
      ["upsert", googleEventId(CONFIG_ID, "2")],
    ]);
    expect(summarizePlan(ops)).toEqual({ move: 1 });
  });
});

describe("renderEvent", () => {
  const l = lesson({ sourceId: "919167", notes: "Portare il libro" });

  it("marks the event with the private extended properties", () => {
    const { body } = renderEvent({ lesson: l, status: "active", cancelledAt: null, removedAt: null }, CTX);
    expect(body.extendedProperties.private).toEqual({
      source: "unibg-sync",
      configId: CONFIG_ID,
      sourceId: "919167",
      contentHash: l.contentHash,
      courseCode: "EC172341",
    });
    expect(body).toMatchObject({
      summary: "FISICA I",
      location: "D001 [Edificio D - Dalmine], Via Pasubio, 3, 24044 Dalmine BG",
      start: { dateTime: "2026-10-16T09:00:00+02:00", timeZone: "Europe/Rome" },
      end: { dateTime: "2026-10-16T11:00:00+02:00", timeZone: "Europe/Rome" },
      transparency: "opaque",
      status: "confirmed",
      reminders: { useDefault: true },
      source: { title: "UniBG Agenda Web" },
    });
    expect(body.colorId).toBeUndefined();
    expect(body.description).toContain("Docente: Garattini Remo");
    expect(body.description).toContain("Tipo: Lezione · Obbligatorio");
    expect(body.description).toContain("Note: Portare il libro");
    expect(body.description).toContain("attivita%5B%5D=EC172341");
    expect(body.description.endsWith("Sincronizzato da unibg-sync")).toBe(true);
  });

  it("renders cancelled lessons", () => {
    const c = lesson({ sourceId: "1", cancelled: true });
    const { body } = renderEvent(
      { lesson: c, status: "cancelled", cancelledAt: "2026-10-01T17:40:00.000Z", removedAt: null },
      CTX,
    );
    expect(body.summary).toBe("❌ ANNULLATA – FISICA I");
    expect(body.colorId).toBe(CANCELLED_COLOR);
    expect(body.transparency).toBe("transparent");
    expect(body.description.split("\n")[0]).toBe("Lezione annullata (rilevato il 01/10/2026 19:40)");
  });

  it("renders removed lessons", () => {
    const { body } = renderEvent(
      { lesson: l, status: "removed", cancelledAt: null, removedAt: "2026-10-01T08:00:00.000Z" },
      CTX,
    );
    expect(body.summary).toBe("⚠️ RIMOSSA – FISICA I");
    expect(body.colorId).toBe(REMOVED_COLOR);
    expect(body.transparency).toBe("transparent");
  });

  it("applies title prefix, reminders and colour options", () => {
    const t = lesson({ sourceId: "1", kind: "Prova in itinere" });
    const opts = { ...CTX.options, colorId: "5", reminder: { mode: "minutes" as const, minutes: 30 } };
    const { body } = renderEvent(
      { lesson: t, status: "active", cancelledAt: null, removedAt: null },
      { ...CTX, options: opts },
    );
    expect(body.summary).toBe("[Prova in itinere] FISICA I");
    expect(body.colorId).toBe("5");
    expect(body.reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 30 }] });
    const none = renderEvent(
      { lesson: l, status: "active", cancelledAt: null, removedAt: null },
      { ...CTX, options: { ...opts, reminder: { mode: "none" }, titlePrefix: "never" } },
    ).body;
    expect(none.reminders).toEqual({ useDefault: false, overrides: [] });
    expect(none.summary).toBe("FISICA I");
  });
});
