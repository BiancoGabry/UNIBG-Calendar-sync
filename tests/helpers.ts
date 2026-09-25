import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(__dirname, "..", "fixtures");

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

export function fixtureJson<T = unknown>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export const GRID_2026 = "grid_call_21-R_PDS0-2012-1.json";
export const GRID_2026_MULTI = "grid_call_21-R_PDS0-2012-1+2.json";
export const GRID_2026_WEEK = "grid_call_21-R_PDS0-2012-1_week.json";
export const GRID_2025_OCT = "grid_call_2025_21-R_PDS0-2012-1_date-15-10-2025.json";
export const GRID_2025_JAN = "grid_call_2025_21-R_PDS0-2012-1_date-20-01-2026.json";
