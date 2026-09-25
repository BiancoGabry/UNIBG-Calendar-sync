// Server-side access to EasyStaff with caching: combo.php in DB (24 h), grid previews in memory.
import type { Db } from "@/lib/db/client";
import { getCache, setCache } from "@/lib/db/repo";
import { easyStaffEnv } from "@/lib/env";
import { fetchAcademicYearsText, fetchCoursesText, parseAcademicYears, parseCourses, type AcademicYear } from "./combo";
import { fetchGrid, type GridRequest } from "./grid";
import { EasyStaffClient } from "./http";
import { normalizeGrid, type NormalizedGrid } from "./normalize";
import type { CoursesCombo } from "./schemas";

export const COMBO_TTL_MS = 24 * 3600_000;

const globalForClient = globalThis as unknown as { __easystaff?: EasyStaffClient };

/** One client per process: requests are serialised with ~1 s spacing. */
export function easyStaffClient(): EasyStaffClient {
  if (!globalForClient.__easystaff) {
    const e = easyStaffEnv();
    globalForClient.__easystaff = new EasyStaffClient({
      baseUrl: e.EASYSTAFF_BASE_URL,
      userAgent: e.EASYSTAFF_USER_AGENT,
    });
  }
  return globalForClient.__easystaff;
}

async function cachedText(db: Db, key: string, fetcher: () => Promise<string>, maxAgeMs: number): Promise<string> {
  const hit = getCache(db, key);
  if (hit && Date.now() - Date.parse(hit.fetchedAt) < maxAgeMs) return hit.body;
  try {
    const body = await fetcher();
    setCache(db, key, body);
    return body;
  } catch (err) {
    if (hit) return hit.body; // stale is better than nothing
    throw err;
  }
}

export async function getAcademicYears(db: Db, opts: { maxAgeMs?: number } = {}): Promise<AcademicYear[]> {
  const text = await cachedText(
    db,
    "anni",
    () => fetchAcademicYearsText(easyStaffClient()),
    opts.maxAgeMs ?? COMBO_TTL_MS,
  );
  return parseAcademicYears(text);
}

const parsedCombo = new Map<string, { fetchedAt: string; combo: CoursesCombo }>();

export async function getCoursesCombo(db: Db, aa: string, opts: { maxAgeMs?: number } = {}): Promise<CoursesCombo> {
  const key = `corsi:${aa}`;
  await cachedText(db, key, () => fetchCoursesText(easyStaffClient(), aa), opts.maxAgeMs ?? COMBO_TTL_MS);
  const row = getCache(db, key)!;
  const memo = parsedCombo.get(key);
  if (memo && memo.fetchedAt === row.fetchedAt) return memo.combo;
  const combo = parseCourses(row.body);
  parsedCombo.set(key, { fetchedAt: row.fetchedAt, combo });
  return combo;
}

// Grid previews for the wizard: 10 minutes in memory, so clicking around does not hit the portal.
const PREVIEW_TTL_MS = 10 * 60_000;
const previewCache = new Map<string, { at: number; grid: NormalizedGrid }>();

export async function getGridPreview(req: GridRequest): Promise<NormalizedGrid> {
  const key = JSON.stringify([req.aa, req.course, req.curricula.map((c) => c.value).sort()]);
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < PREVIEW_TTL_MS) return hit.grid;
  const grid = normalizeGrid(await fetchGrid(easyStaffClient(), req));
  previewCache.set(key, { at: Date.now(), grid });
  if (previewCache.size > 20) previewCache.delete(previewCache.keys().next().value!);
  return grid;
}
