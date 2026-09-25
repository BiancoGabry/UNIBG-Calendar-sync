// combo.php: academic years and the course catalogue (courses, curricula, teachings, periods).
import { EasyStaffClient, EasyStaffError } from "./http";
import { parseJsVars, JsVarsParseError } from "./jsvars";
import { academicYearsSchema, coursesComboSchema, type CoursesCombo, type DegreeCourseRaw } from "./schemas";
import { fixMojibake } from "./text";
import type { z } from "zod";

export type AcademicYear = { value: string; label: string };

export const OTHER_SCHOOL = "__altri__";

function parseJs<T extends z.ZodType>(text: string, schema: T, what: string): z.output<T> {
  let vars: Record<string, unknown>;
  try {
    vars = parseJsVars(text);
  } catch (err) {
    if (err instanceof JsVarsParseError) throw new EasyStaffError("parse", `${what}: ${err.message}`);
    throw err;
  }
  const parsed = schema.safeParse(vars);
  if (!parsed.success) {
    throw new EasyStaffError("validation", `${what}: risposta con struttura inattesa`, parsed.error.issues);
  }
  return parsed.data;
}

/** Parses `var anni_accademici_ec = {...};`. Sorted newest first. */
export function parseAcademicYears(text: string): AcademicYear[] {
  const data = parseJs(text, academicYearsSchema, "combo.php anni");
  return Object.values(data.anni_accademici_ec)
    .map((y) => ({ value: y.valore, label: y.label }))
    .sort((a, b) => Number(b.value) - Number(a.value));
}

/** Parses the course catalogue. Aliases such as `var elenco_cdl = elenco_corsi;` are ignored. */
export function parseCourses(text: string): CoursesCombo {
  const data = parseJs(text, coursesComboSchema, "combo.php corsi");
  // Labels can carry double-encoded UTF-8 like the grid payload.
  for (const c of data.elenco_corsi) {
    c.label = fixMojibake(c.label);
    for (const y of c.elenco_anni) {
      y.label = fixMojibake(y.label);
      for (const t of y.elenco_insegnamenti) {
        t.label = fixMojibake(t.label);
        t.docente = fixMojibake(t.docente);
      }
    }
  }
  for (const s of data.elenco_scuole) s.label = fixMojibake(s.label);
  return data;
}

export function fetchAcademicYearsText(client: EasyStaffClient): Promise<string> {
  return client.get("combo.php?sw=ec_&aa=1");
}

export function fetchCoursesText(client: EasyStaffClient, aa: string): Promise<string> {
  return client.get(`combo.php?sw=ec_&aa=${encodeURIComponent(aa)}&page=corsi`);
}

// ---------------------------------------------------------------------------
// Slim catalogue for the UI (the raw payload is ~380 KB).

export type CurriculumOption = {
  value: string; // "PDS0-2012|1" → anno2[]
  label: string; // "1 - PERCORSO COMUNE" → txtcurr
  year: string; // part after "|"
  teachingCount: number;
};

export type PeriodInfo = { id: string; code: string; label: string; published: boolean };

export type CourseSummary = {
  value: string; // "21-R"
  label: string;
  type: string;
  school: string; // elenco_scuole[].valore, or OTHER_SCHOOL
  published: boolean; // pub_periodi not empty
  periods: PeriodInfo[];
  curricula: CurriculumOption[];
};

export type CatalogSummary = {
  schools: { value: string; label: string }[];
  courses: CourseSummary[];
};

export function curriculumYear(value: string): string {
  const i = value.lastIndexOf("|");
  return i >= 0 ? value.slice(i + 1) : "";
}

export function coursePeriods(course: DegreeCourseRaw): PeriodInfo[] {
  const published = new Set(course.pub_periodi.map((p) => p.id));
  const byId = new Map<string, PeriodInfo>();
  for (const p of [...course.periodi, ...course.pub_periodi]) {
    byId.set(p.id, { id: p.id, code: p.valore, label: p.label, published: published.has(p.id) });
  }
  return [...byId.values()];
}

export function summarizeCatalog(combo: CoursesCombo): CatalogSummary {
  const knownSchools = new Set(combo.elenco_scuole.map((s) => s.valore));
  const courses: CourseSummary[] = combo.elenco_corsi.map((c) => ({
    value: c.valore,
    label: c.label,
    type: c.tipo,
    school: knownSchools.has(c.scuola) ? c.scuola : OTHER_SCHOOL,
    published: c.pub_periodi.length > 0,
    periods: coursePeriods(c),
    curricula: c.elenco_anni.map((y) => ({
      value: y.valore,
      label: y.label,
      year: curriculumYear(y.valore),
      teachingCount: y.elenco_insegnamenti.length,
    })),
  }));
  const schools = combo.elenco_scuole.map((s) => ({ value: s.valore, label: s.label }));
  if (courses.some((c) => c.school === OTHER_SCHOOL)) {
    schools.push({ value: OTHER_SCHOOL, label: "Altri corsi" });
  }
  return { schools, courses };
}
