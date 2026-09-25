import { beforeEach, describe, expect, it } from "vitest";
import { openDb, runMigrations, type Db } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import { parseGridResponse } from "@/lib/easystaff/grid";
import { normalizeGrid, type NormalizedGrid } from "@/lib/easystaff/normalize";
import { EasyStaffError } from "@/lib/easystaff/http";
import { DEFAULT_EVENT_OPTIONS } from "@/lib/sync/event";
import { googleEventId } from "@/lib/sync/ids";
import { runSync, teardown, type SyncDeps } from "@/lib/sync/run";
import { FakeCalendar } from "./fake-calendar";
import { fixture, GRID_2026 } from "./helpers";
import { CONFIG_ID } from "./sync-helpers";

const BASE_GRID = normalizeGrid(parseGridResponse(fixture(GRID_2026)));
const NOW = new Date("2026-09-25T20:00:00+02:00");
const SELECTED = ["EC172165", "EC172341", "EC41298_ES_B", "ECCCLENGB1"];
const SA_EMAIL = "unibg-sync@progetto.iam.gserviceaccount.com";

let db: Db;
let cal: FakeCalendar;
let grid: NormalizedGrid | Error;

function deps(): SyncDeps {
  return {
    db,
    fetchGrid: async () => {
      if (grid instanceof Error) throw grid;
      return grid;
    },
    calendarApi: () => cal,
    accountEmail: () => SA_EMAIL,
    portalBaseUrl: "https://logistica.unibg.it/PortaleStudenti/",
    batchSize: 1000,
    batchPauseMs: 0,
    now: () => NOW,
  };
}

const sync = (opts: Partial<Parameters<typeof runSync>[1]> = {}) =>
  runSync(CONFIG_ID, { trigger: "cli", ...opts }, deps());
const expectedLessons = () =>
  BASE_GRID.lessons.filter((l) => SELECTED.includes(l.courseCode) && Date.parse(l.end) > NOW.getTime());

beforeEach(() => {
  db = openDb(":memory:").db;
  runMigrations(db);
  cal = new FakeCalendar();
  grid = structuredClone(BASE_GRID);
  repo.insertConfig(db, {
    id: CONFIG_ID,
    name: "Test",
    aa: "2026",
    aaLabel: "2026/2027",
    courseCode: "21-R",
    courseLabel: "INGEGNERIA INFORMATICA",
    curricula: [{ value: "PDS0-2012|1", label: "1 - PERCORSO COMUNE" }],
    selectedCourses: SELECTED,
    excludedCourses: BASE_GRID.legend.map((l) => l.code).filter((c) => !SELECTED.includes(c)),
    calendarId: "cal1",
    options: DEFAULT_EVENT_OPTIONS,
    status: "active",
  });
});

describe("runSync", () => {
  it("first run inserts every selected future lesson and stores the snapshot", async () => {
    const r = await sync();
    expect(r.status).toBe("ok");
    const n = expectedLessons().length;
    expect(r.summary).toEqual({ insert: n });
    expect(cal.active()).toHaveLength(n);
    expect(repo.loadSnapshot(db, CONFIG_ID)).toHaveLength(n);
    const cfg = repo.getConfig(db, CONFIG_ID)!;
    expect(cfg.lastResponseCount).toBe(237);
    expect(cfg.fileDate).toBe("25-09-2026 19:20");
    expect(cfg.seenCourses.sort()).toEqual([...SELECTED].sort());
    // every event is marked
    expect(cal.active().every((e) => e.extendedProperties?.private?.source === "unibg-sync")).toBe(true);
  });

  it("is idempotent: the second run makes zero writes", async () => {
    await sync();
    cal.calls = [];
    const r = await sync();
    expect(r.summary).toEqual({});
    expect(cal.writes()).toEqual([]);
  });

  it("dry-run plans without writing anything", async () => {
    const r = await sync({ dryRun: true });
    expect(r.plan.length).toBe(expectedLessons().length);
    expect(r.plan[0].message).toMatch(/^Nuova lezione: /);
    expect(cal.calls).toEqual([]);
    expect(repo.loadSnapshot(db, CONFIG_ID)).toEqual([]);
  });

  it("applies a cancellation as a patch and logs it", async () => {
    await sync();
    const g = grid as NormalizedGrid;
    const target = g.lessons.find(
      (l) => l.courseCode === "EC172341" && !l.cancelled && Date.parse(l.start) > NOW.getTime(),
    )!;
    const { contentHash: _h, ...rest } = target;
    const { contentHash } = await import("@/lib/easystaff/normalize");
    Object.assign(target, { cancelled: true, contentHash: contentHash({ ...rest, cancelled: true } as never) });
    cal.calls = [];
    const r = await sync();
    expect(r.summary).toEqual({ cancelled: 1 });
    expect(cal.writes()).toEqual([{ op: "update", eventId: googleEventId(CONFIG_ID, target.sourceId) }]);
    const ev = cal.events.get(googleEventId(CONFIG_ID, target.sourceId))!;
    expect(ev.summary).toBe("❌ ANNULLATA – FISICA I");
    expect(ev.colorId).toBe("11");
    expect(repo.listLogs(db, CONFIG_ID)[0].message).toMatch(/^FISICA I – .* annullata$/);
  });

  it("re-creates an event deleted by hand on Google (409 → revive)", async () => {
    await sync();
    const l = expectedLessons()[0];
    const id = googleEventId(CONFIG_ID, l.sourceId);
    await cal.deleteEvent("cal1", id); // user deleted it
    repo.deleteSnapshotEntry(db, CONFIG_ID, l.sourceId); // and the app lost track of it
    cal.calls = [];
    await sync();
    expect(cal.writes().map((c) => c.op)).toEqual(["insert", "update"]);
    expect(cal.events.get(id)!.status).toBe("confirmed");
  });

  it("falls back to insert when the event is missing (404)", async () => {
    await sync();
    const l = expectedLessons()[0];
    const id = googleEventId(CONFIG_ID, l.sourceId);
    cal.events.delete(id);
    const entry = repo.loadSnapshot(db, CONFIG_ID).find((e) => e.sourceId === l.sourceId)!;
    repo.saveSnapshotEntry(db, CONFIG_ID, { ...entry, eventHash: "stale" }); // force a rewrite
    cal.calls = [];
    await sync();
    expect(cal.writes().map((c) => c.op)).toEqual(["update", "insert"]);
    expect(cal.events.has(id)).toBe(true);
  });

  it("blocks on an anomaly and counts consecutive anomalies", async () => {
    await sync();
    cal.calls = [];
    grid = { ...(grid as NormalizedGrid), lessons: [] };
    for (let i = 1; i <= 3; i++) {
      const r = await sync();
      expect(r.status).toBe("anomaly");
      expect(repo.getConfig(db, CONFIG_ID)!.consecutiveAnomalies).toBe(i);
    }
    expect(cal.writes()).toEqual([]);
    // Validation errors are anomalies too.
    grid = new EasyStaffError("validation", "struttura inattesa");
    expect((await sync()).anomaly?.reason).toBe("validation_failed");
    // A good run resets the counter.
    grid = structuredClone(BASE_GRID);
    await sync();
    expect(repo.getConfig(db, CONFIG_ID)!.consecutiveAnomalies).toBe(0);
  });

  it("deselecting a teaching deletes only its future events", async () => {
    await sync();
    repo.updateConfig(db, CONFIG_ID, { selectedCourses: SELECTED.filter((c) => c !== "ECCCLENGB1") });
    cal.calls = [];
    const r = await sync();
    const english = expectedLessons().filter((l) => l.courseCode === "ECCCLENGB1").length;
    expect(r.summary).toEqual({ delete: english });
    expect(cal.writes().every((c) => c.op === "delete")).toBe(true);
  });

  it("pauses everything on invalid_grant", async () => {
    // The real client turns an invalid_grant response into GoogleAuthRevokedError (withBackoff).
    const { GoogleAuthRevokedError } = await import("@/lib/google/errors");
    cal.failNext = () => new GoogleAuthRevokedError();
    const r = await sync();
    expect(r.status).toBe("error");
    expect(repo.getConfig(db, CONFIG_ID)).toMatchObject({ status: "paused", pauseReason: "google" });
  });

  it("keeps going when a single operation fails and retries it next time", async () => {
    const failing = googleEventId(CONFIG_ID, expectedLessons()[1].sourceId);
    cal.failNext = (op, id) =>
      id === failing && op === "insert" ? Object.assign(new Error("boom"), { status: 400 }) : null;
    const r = await sync();
    expect(r.status).toBe("partial");
    expect(repo.loadSnapshot(db, CONFIG_ID)).toHaveLength(expectedLessons().length - 1);
    cal.failNext = null;
    const again = await sync();
    expect(again.summary).toEqual({ insert: 1 });
  });

  it("reports new teachings in the legend as pending", async () => {
    repo.updateConfig(db, CONFIG_ID, { excludedCourses: [] });
    await sync();
    const pending = repo.getConfig(db, CONFIG_ID)!.pendingCourses.map((p) => p.code);
    expect(pending).toHaveLength(18 - SELECTED.length);
    expect(pending).not.toContain("EC172165");
  });

  it("teardown deletes only marked events of this config", async () => {
    await sync();
    cal.events.set("mine", { id: "mine", summary: "Dentista" });
    cal.events.set("other", {
      id: "other",
      summary: "altro config",
      extendedProperties: { private: { source: "unibg-sync", configId: "ffffffff" } },
    });
    const r = await teardown(CONFIG_ID, deps());
    expect(r.deleted).toBe(expectedLessons().length);
    expect(
      cal
        .active()
        .map((e) => e.id)
        .sort(),
    ).toEqual(["mine", "other"]);
    expect(repo.loadSnapshot(db, CONFIG_ID)).toEqual([]);
    expect(repo.getConfig(db, CONFIG_ID)!.status).toBe("draft");
  });

  it("rebuilds the snapshot from Google when the DB was lost", async () => {
    await sync();
    repo.deleteSnapshot(db, CONFIG_ID);
    repo.updateConfig(db, CONFIG_ID, { lastSuccessAt: null });
    cal.calls = [];
    const r = await sync();
    // Everything is rewritten once (event hash unknown), nothing is inserted twice.
    expect(r.summary).toEqual({ refresh: expectedLessons().length });
    expect(cal.writes().every((c) => c.op === "update")).toBe(true);
    cal.calls = [];
    await sync();
    expect(cal.writes()).toEqual([]);
  });

  it("stops before writing when the calendar is no longer shared, logs once, recovers by itself", async () => {
    await sync();
    cal.unshare("cal1");
    cal.calls = [];
    grid = { ...(grid as NormalizedGrid), lessons: (grid as NormalizedGrid).lessons.slice(1) };
    const r1 = await sync();
    const r2 = await sync();
    expect(r1.status).toBe("error");
    expect(r1.error).toContain(SA_EMAIL);
    expect(r2.status).toBe("error");
    expect(cal.writes()).toEqual([]);
    expect(repo.getConfig(db, CONFIG_ID)!.status).toBe("error");
    expect(repo.listLogs(db, CONFIG_ID).filter((l) => l.kind === "calendar_access")).toHaveLength(1);

    // Shared again: the next run (worker retries "error" configs) recovers.
    cal.shared.set("cal1", "writer");
    const r3 = await sync();
    expect(r3.status).toBe("ok");
    expect(repo.getConfig(db, CONFIG_ID)!.status).toBe("active");
  });

  it("rejects a calendar shared read-only", async () => {
    cal.shared.set("cal1", "reader");
    const r = await sync();
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/non può più modificare/);
    expect(cal.writes()).toEqual([]);
  });

  it("never sends attendees", async () => {
    await sync();
    expect(cal.active().every((e) => e.attendees === undefined)).toBe(true);
  });
});
