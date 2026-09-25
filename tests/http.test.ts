import { describe, expect, it } from "vitest";
import { EasyStaffClient, EasyStaffError, decodeBody } from "@/lib/easystaff/http";
import { mergeGrids } from "@/lib/easystaff/lessons";
import { parseGridResponse } from "@/lib/easystaff/grid";
import { normalizeGrid } from "@/lib/easystaff/normalize";
import { fixture, GRID_2026, GRID_2026_WEEK } from "./helpers";

function client(responses: (() => Response | Promise<Response>)[], log: { url: string; at: number }[] = []) {
  let i = 0;
  const sleeps: number[] = [];
  const c = new EasyStaffClient({
    baseUrl: "https://example.test/PortaleStudenti",
    userAgent: "test-agent",
    fetchImpl: (async (url: string, init: RequestInit) => {
      log.push({ url: String(url), at: Date.now() });
      expect((init.headers as Record<string, string>)["User-Agent"]).toBe("test-agent");
      return responses[Math.min(i++, responses.length - 1)]();
    }) as typeof fetch,
    minIntervalMs: 50,
    backoffBaseMs: 1,
    sleep: async (ms) => {
      sleeps.push(ms);
      await new Promise((r) => setTimeout(r, ms));
    },
  });
  return { c, sleeps };
}

describe("EasyStaffClient", () => {
  it("retries 5xx with exponential backoff, then succeeds", async () => {
    const { c } = client([
      () => new Response("", { status: 503 }),
      () => new Response("", { status: 502 }),
      () => new Response("ok"),
    ]);
    await expect(c.get("combo.php?sw=ec_&aa=1")).resolves.toBe("ok");
  });

  it("gives up after 3 retries", async () => {
    const log: { url: string; at: number }[] = [];
    const { c } = client([() => new Response("", { status: 500 })], log);
    await expect(c.get("x")).rejects.toBeInstanceOf(EasyStaffError);
    expect(log).toHaveLength(4); // 1 + 3 retries
  });

  it("does not retry client errors", async () => {
    const log: { url: string; at: number }[] = [];
    const { c } = client([() => new Response("", { status: 404 })], log);
    await expect(c.get("x")).rejects.toMatchObject({ kind: "http" });
    expect(log).toHaveLength(1);
  });

  it("serialises requests with a pause between them", async () => {
    const log: { url: string; at: number }[] = [];
    const { c } = client([() => new Response("a")], log);
    await Promise.all([c.get("1"), c.get("2"), c.get("3")]);
    expect(log.map((l) => l.url.split("/").pop())).toEqual(["1", "2", "3"]);
    expect(log[1].at - log[0].at).toBeGreaterThanOrEqual(45);
    expect(log[2].at - log[1].at).toBeGreaterThanOrEqual(45);
  });

  it("decodes UTF-8, falling back to Windows-1252", () => {
    expect(decodeBody(new TextEncoder().encode("Università").buffer as ArrayBuffer)).toBe("Università");
    expect(decodeBody(Uint8Array.from([0x55, 0x6e, 0x69, 0xe0]).buffer)).toBe("Unià");
  });
});

describe("weekly fallback", () => {
  it("merges week responses, deduplicating by id", () => {
    const week = normalizeGrid(parseGridResponse(fixture(GRID_2026_WEEK)));
    const full = normalizeGrid(parseGridResponse(fixture(GRID_2026)));
    expect(week.window).toMatchObject({ firstDay: "2026-09-21", lastDay: "2026-09-27" });
    // Week lessons are a subset of the all_events response, with identical content.
    const byId = new Map(full.lessons.map((l) => [l.sourceId, l.contentHash]));
    expect(week.lessons.every((l) => byId.get(l.sourceId) === l.contentHash)).toBe(true);
    const merged = mergeGrids([week, full, week]);
    expect(merged.lessons).toHaveLength(full.lessons.length);
    expect(merged.window).toMatchObject({ firstDay: "2026-09-14", lastDay: "2026-12-20" });
  });
});
