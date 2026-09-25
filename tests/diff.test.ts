import { describe, expect, it } from "vitest";
import { diff } from "@/lib/sync/diff";
import { describeAction } from "@/lib/sync/messages";
import type { Window } from "@/lib/sync/types";
import { entry, lesson, selectAll } from "./sync-helpers";

const NOW = new Date("2026-10-01T10:00:00+02:00");
const WINDOW: Window = { start: "2026-09-14T00:00:00+02:00", end: "2026-12-21T00:00:00+01:00" };

const base = lesson({ sourceId: "919167" });
const other = lesson({
  sourceId: "919200",
  courseCode: "EC172165",
  courseName: "ANALISI MATEMATICA I",
  title: "ANALISI MATEMATICA I",
  start: "2026-10-20T14:00:00+02:00",
  end: "2026-10-20T17:00:00+02:00",
});
const all = [base, other];
const opts = { selection: selectAll(all), window: WINDOW };

describe("diff", () => {
  it("no changes → 0 actions", () => {
    expect(diff([entry(base), entry(other)], all, NOW, opts)).toEqual([]);
  });

  it("new lesson → insert", () => {
    const actions = diff([entry(base)], all, NOW, opts);
    expect(actions).toMatchObject([{ type: "insert", lesson: { sourceId: "919200" } }]);
    expect(describeAction(actions[0])).toBe("Nuova lezione: ANALISI MATEMATICA I – mar 20/10 14:00");
  });

  it("new lesson already cancelled → insert (kept visible)", () => {
    const cancelled = lesson({ sourceId: "5", cancelled: true });
    const actions = diff([], [cancelled], NOW, { ...opts, selection: selectAll([cancelled]) });
    expect(actions).toMatchObject([{ type: "insert", lesson: { cancelled: true } }]);
  });

  it("Annullato 0 → 1 → patch with transition cancelled", () => {
    const now = { ...base, cancelled: true };
    const cancelled = lesson({ ...now });
    const [a] = diff([entry(base), entry(other)], [cancelled, other], NOW, opts);
    expect(a).toMatchObject({ type: "patch", transition: "cancelled", changes: [] });
    expect(describeAction(a)).toBe("FISICA I – ven 16/10 09:00: annullata");
  });

  it("Annullato 1 → 0 → patch with transition restored", () => {
    const cancelled = lesson({ sourceId: base.sourceId, cancelled: true });
    const [a] = diff([entry(cancelled), entry(other)], all, NOW, opts);
    expect(a).toMatchObject({ type: "patch", transition: "restored" });
  });

  it("room change → patch with old → new", () => {
    const moved = lesson({ sourceId: base.sourceId, room: "B201 [Edificio B - Dalmine]", roomCode: "B201" });
    const [a] = diff([entry(base), entry(other)], [moved, other], NOW, opts);
    expect(a).toMatchObject({
      type: "patch",
      transition: null,
      changes: [{ field: "room", from: "D001", to: "B201" }],
    });
    expect(describeAction(a)).toBe("FISICA I – ven 16/10 09:00: aula D001 → B201");
  });

  it("time change → patch", () => {
    const later = lesson({
      sourceId: base.sourceId,
      start: "2026-10-16T10:00:00+02:00",
      end: "2026-10-16T12:00:00+02:00",
    });
    const [a] = diff([entry(base), entry(other)], [later, other], NOW, opts);
    expect(a).toMatchObject({ type: "patch", changes: [{ field: "time", from: "09:00–11:00", to: "10:00–12:00" }] });
  });

  it("teacher change → patch", () => {
    const t = lesson({ sourceId: base.sourceId, teacher: "Rossi Mario" });
    const [a] = diff([entry(base), entry(other)], [t, other], NOW, opts);
    expect(describeAction(a)).toBe("FISICA I – ven 16/10 09:00: docente Garattini Remo → Rossi Mario");
  });

  it("lesson gone inside the window → markRemoved", () => {
    const actions = diff([entry(base), entry(other)], [other], NOW, opts);
    expect(actions).toMatchObject([{ type: "markRemoved", prev: { sourceId: base.sourceId } }]);
    expect(describeAction(actions[0])).toBe("FISICA I – ven 16/10 09:00: rimossa dall'orario");
  });

  it("lesson gone outside the covered window → nothing", () => {
    const window: Window = { start: "2026-10-18T00:00:00+02:00", end: "2026-12-21T00:00:00+01:00" };
    expect(diff([entry(base), entry(other)], [other], NOW, { ...opts, window })).toEqual([]);
  });

  it("already-removed lesson stays removed without new actions", () => {
    expect(diff([entry(base, { status: "removed" }), entry(other)], [other], NOW, opts)).toEqual([]);
  });

  it("removed lesson comes back → patch reappeared", () => {
    const [a] = diff([entry(base, { status: "removed" }), entry(other)], all, NOW, opts);
    expect(a).toMatchObject({ type: "patch", transition: "reappeared" });
  });

  it("new id + old id gone, same course/week/duration → move", () => {
    const moved = lesson({ sourceId: "999999", start: "2026-10-14T14:00:00+02:00", end: "2026-10-14T16:00:00+02:00" });
    const actions = diff([entry(base), entry(other)], [moved, other], NOW, opts);
    expect(actions).toMatchObject([
      { type: "move", prev: { sourceId: base.sourceId }, lesson: { sourceId: "999999" } },
    ]);
    expect(describeAction(actions[0])).toBe("FISICA I: spostata da ven 16/10 09:00 a mer 14/10 14:00");
  });

  it("new id in another week → markRemoved + insert, not move", () => {
    const moved = lesson({ sourceId: "999999", start: "2026-10-21T09:00:00+02:00", end: "2026-10-21T11:00:00+02:00" });
    const types = diff([entry(base), entry(other)], [moved, other], NOW, opts)
      .map((a) => a.type)
      .sort();
    expect(types).toEqual(["insert", "markRemoved"]);
  });

  it("past lessons are never touched", () => {
    const later = new Date("2026-10-16T12:00:00+02:00"); // FISICA I ended at 11:00
    const changed = lesson({ sourceId: base.sourceId, roomCode: "X", room: "X" });
    expect(diff([entry(base), entry(other)], [changed, other], later, opts)).toEqual([]);
    expect(diff([entry(base), entry(other)], [other], later, opts)).toEqual([]);
    expect(diff([], [base], later, { ...opts, selection: selectAll([base]) })).toEqual([]);
  });

  it("deselected teaching → delete (future only)", () => {
    const selection = { courses: new Set(["EC172165"]), includeRecommended: true };
    const actions = diff([entry(base), entry(other)], all, NOW, { ...opts, selection });
    expect(actions).toMatchObject([{ type: "delete", reason: "deselected", prev: { sourceId: base.sourceId } }]);
  });

  it("recommended lessons excluded by option → delete", () => {
    const english = lesson({ sourceId: "7", courseCode: "ECCCLENGB1", required: false, title: "INGLESE" });
    const actions = diff([entry(english)], [english], NOW, { ...opts, selection: selectAll([english], false) });
    expect(actions).toMatchObject([{ type: "delete" }]);
  });

  it("ignores lessons of teachings that were never selected", () => {
    const selection = { courses: new Set(["EC172341"]), includeRecommended: true };
    expect(diff([entry(base)], all, NOW, { ...opts, selection })).toEqual([]);
  });
});
