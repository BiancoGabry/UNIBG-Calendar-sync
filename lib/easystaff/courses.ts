// Teaching catalogue for one course + curricula: dedup, exercise grouping, letter groups.
import type { DegreeCourseRaw } from "./schemas";
import { coursePeriods, type PeriodInfo } from "./combo";
import type { LegendItem } from "./normalize";
import { parseLetterRange, type LetterRange } from "./letters";

export { letterInRange, parseLetterRange, suggestExercises } from "./letters";
export type { LetterRange, LetterSuggestion } from "./letters";

export type TeachingItem = {
  code: string;
  name: string;
  teacher: string;
  periodId: string | null;
  periodLabel: string | null;
  periodPublished: boolean | null;
  required: boolean | null; // from the grid legend; null if unknown
  curricula: string[]; // anno2 values where it appears
  inLegend: boolean;
  lessonCount: number;
  isExercise: boolean;
  letterRange: LetterRange | null;
};

export type TeachingGroup = {
  key: string;
  title: string;
  main: TeachingItem | null;
  exercises: TeachingItem[];
};

const EXERCISE_CODE_RE = /_es(?:_|$)/i;
const EXERCISE_NAME_RE = /\b(exe|esercitazion[ei])\b/i;

export function isExerciseTeaching(code: string, name: string): boolean {
  return EXERCISE_CODE_RE.test(code) || EXERCISE_NAME_RE.test(name);
}

/** "EC41298_ES_B" → "EC41298", "EC65744_Es_C" → "EC65744". */
export function exercisePrefix(code: string): string {
  const m = code.match(/^(.*?)_es(?:_|$)/i);
  return m ? m[1] : code;
}

const STOPWORDS = new Set([
  "e",
  "ed",
  "di",
  "del",
  "della",
  "dello",
  "dei",
  "degli",
  "delle",
  "da",
  "per",
  "la",
  "il",
  "lo",
  "le",
  "gli",
  "a",
  "in",
  "con",
  "mod",
  "modulo",
]);

/** Name → comparable tokens: lowercase, no accents, no parentheses, no "exe ..." tail. */
export function nameTokens(name: string): string[] {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(exe|esercitazion[ei])\b.*$/, " ")
    .replace(/[^a-z0-9]+/g, " ");
  return base.split(" ").filter((t) => t && !STOPWORDS.has(t));
}

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((t) => sb.has(t));
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export type CatalogInput = {
  course: DegreeCourseRaw;
  curricula: string[]; // selected anno2 values
  legend?: LegendItem[];
  lessonCounts?: ReadonlyMap<string, number>;
};

/** Teachings of the selected curricula (+ grid legend), deduplicated by code. */
export function buildTeachingItems(input: CatalogInput): TeachingItem[] {
  const periods = new Map<string, PeriodInfo>(coursePeriods(input.course).map((p) => [p.id, p]));
  const legend = new Map((input.legend ?? []).map((l) => [l.code, l]));
  const items = new Map<string, TeachingItem>();

  for (const year of input.course.elenco_anni) {
    if (!input.curricula.includes(year.valore)) continue;
    for (const t of year.elenco_insegnamenti) {
      const existing = items.get(t.valore);
      if (existing) {
        if (!existing.curricula.includes(year.valore)) existing.curricula.push(year.valore);
        continue;
      }
      const period = t.id_periodo ? periods.get(t.id_periodo) : undefined;
      items.set(t.valore, {
        code: t.valore,
        name: t.label,
        teacher: t.docente,
        periodId: t.id_periodo,
        periodLabel: period?.label ?? null,
        periodPublished: period ? period.published : null,
        required: legend.get(t.valore)?.required ?? null,
        curricula: [year.valore],
        inLegend: legend.has(t.valore),
        lessonCount: input.lessonCounts?.get(t.valore) ?? 0,
        isExercise: isExerciseTeaching(t.valore, t.label),
        letterRange: parseLetterRange(t.label),
      });
    }
  }

  // Teachings that only appear in the grid legend (e.g. shared with other courses).
  for (const l of legend.values()) {
    if (items.has(l.code)) continue;
    items.set(l.code, {
      code: l.code,
      name: l.name,
      teacher: "",
      periodId: null,
      periodLabel: null,
      periodPublished: null,
      required: l.required,
      curricula: [],
      inLegend: true,
      lessonCount: input.lessonCounts?.get(l.code) ?? 0,
      isExercise: isExerciseTeaching(l.code, l.name),
      letterRange: parseLetterRange(l.name),
    });
  }
  return [...items.values()];
}

/**
 * Groups each main teaching with its exercise groups. Exercises are first grouped by
 * code prefix (before "_ES"); a group attaches to a main teaching when the prefix equals
 * its code, or when an exercise name matches the main name (the prefix is often an old
 * code, e.g. "EC41298_ES_B" belongs to "ANALISI MATEMATICA I" = "EC172165").
 */
export function groupTeachings(items: TeachingItem[]): TeachingGroup[] {
  const mains = items.filter((i) => !i.isExercise);
  const exercises = items.filter((i) => i.isExercise);

  const byPrefix = new Map<string, TeachingItem[]>();
  for (const e of exercises) {
    const p = exercisePrefix(e.code);
    byPrefix.set(p, [...(byPrefix.get(p) ?? []), e]);
  }

  const groups = new Map<string, TeachingGroup>();
  for (const m of mains) groups.set(m.code, { key: m.code, title: m.name, main: m, exercises: [] });

  for (const [prefix, list] of byPrefix) {
    let target = groups.get(prefix)?.main ? groups.get(prefix) : undefined;
    if (!target) {
      target = mains
        .map((m) => groups.get(m.code)!)
        .find((g) => list.some((e) => sameTokens(nameTokens(e.name), nameTokens(g.main!.name))));
    }
    if (target) {
      target.exercises.push(...list);
    } else {
      const base = nameTokens(list[0].name).join(" ");
      groups.set(`ex:${prefix}`, {
        key: `ex:${prefix}`,
        title: `${titleCase(base || list[0].name)} – esercitazioni`,
        main: null,
        exercises: list,
      });
    }
  }

  for (const g of groups.values()) {
    g.exercises.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "it", { sensitivity: "base" }));
}
