import { describe, expect, it } from "vitest";
import { parseGridResponse } from "@/lib/easystaff/grid";
import { EasyStaffError } from "@/lib/easystaff/http";
import { normalizeGrid } from "@/lib/easystaff/normalize";
import { safetyCheck, type FetchOutcome } from "@/lib/sync/safety";
import { fixture, GRID_2026 } from "./helpers";
import { entry, selectAll } from "./sync-helpers";

const NOW = new Date("2026-09-25T20:00:00+02:00");
const grid = normalizeGrid(parseGridResponse(fixture(GRID_2026)));
const selection = selectAll(grid.lessons);
const prev = grid.lessons.map((l) => entry(l));
const ok = (lessons = grid.lessons, window = grid.window): FetchOutcome => ({ ok: true, lessons, window });

describe("safetyCheck", () => {
  it("accepts an unchanged response", () => {
    expect(safetyCheck({ fetch: ok(), prev, prevResponseCount: 237, selection, now: NOW })).toEqual({ ok: true });
  });

  it("accepts the first run (empty snapshot)", () => {
    expect(safetyCheck({ fetch: ok(), prev: [], prevResponseCount: null, selection, now: NOW }).ok).toBe(true);
  });

  it("blocks an empty response when the previous one had lessons", () => {
    const r = safetyCheck({ fetch: ok([]), prev, prevResponseCount: 237, selection, now: NOW });
    expect(r).toMatchObject({ ok: false, anomaly: { reason: "empty_response" } });
  });

  it("blocks a drop of more than 30%", () => {
    const future = grid.lessons.filter((l) => Date.parse(l.end) > NOW.getTime());
    const kept = grid.lessons.filter((l) => !future.slice(0, Math.ceil(future.length * 0.31)).includes(l));
    const r = safetyCheck({ fetch: ok(kept), prev, prevResponseCount: 237, selection, now: NOW });
    expect(r).toMatchObject({ ok: false, anomaly: { reason: "count_drop" } });
  });

  it("accepts a drop below 30%", () => {
    const kept = grid.lessons.slice(0, grid.lessons.length - 20);
    expect(safetyCheck({ fetch: ok(kept), prev, prevResponseCount: 237, selection, now: NOW }).ok).toBe(true);
  });

  it("blocks when validation (Zod) fails", () => {
    const json = JSON.parse(fixture(GRID_2026));
    json.celle[0].data = "2026/09/14";
    let fetch: FetchOutcome;
    try {
      parseGridResponse(JSON.stringify(json));
      throw new Error("should fail");
    } catch (e) {
      const err = e as EasyStaffError;
      fetch = { ok: false, kind: err.kind, message: err.message };
    }
    const r = safetyCheck({ fetch, prev, prevResponseCount: 237, selection, now: NOW });
    expect(r).toMatchObject({ ok: false, anomaly: { reason: "validation_failed" } });
  });

  it("blocks when the fetch fails", () => {
    const r = safetyCheck({
      fetch: { ok: false, kind: "network", message: "timeout" },
      prev,
      prevResponseCount: 237,
      selection,
      now: NOW,
    });
    expect(r).toMatchObject({ ok: false, anomaly: { reason: "fetch_failed" } });
  });

  it("ignores lessons that moved out of the covered window (semester change)", () => {
    const window = { start: "2027-02-22T00:00:00+01:00", end: "2027-06-14T00:00:00+02:00", firstDay: "", lastDay: "" };
    const r = safetyCheck({
      fetch: ok(grid.lessons.slice(0, 5), window),
      prev,
      prevResponseCount: 237,
      selection,
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("does not count deselected teachings as a drop", () => {
    const only = { courses: new Set(["EC172165"]), includeRecommended: true };
    const kept = grid.lessons.filter((l) => l.courseCode === "EC172165");
    expect(safetyCheck({ fetch: ok(kept), prev, prevResponseCount: 237, selection: only, now: NOW }).ok).toBe(true);
  });
});
