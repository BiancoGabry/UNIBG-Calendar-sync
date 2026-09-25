import { describe, expect, it } from "vitest";
import { parseCourses } from "@/lib/easystaff/combo";
import {
  buildTeachingItems,
  exercisePrefix,
  groupTeachings,
  isExerciseTeaching,
  parseLetterRange,
  suggestExercises,
} from "@/lib/easystaff/courses";
import { parseGridResponse } from "@/lib/easystaff/grid";
import { normalizeGrid } from "@/lib/easystaff/normalize";
import { fixture, GRID_2026 } from "./helpers";

function catalog() {
  const combo = parseCourses(fixture("combo_corsi_2026_raw.js"));
  const course = combo.elenco_corsi.find((c) => c.valore === "21-R")!;
  const grid = normalizeGrid(parseGridResponse(fixture(GRID_2026)));
  const counts = new Map<string, number>();
  for (const l of grid.lessons) counts.set(l.courseCode, (counts.get(l.courseCode) ?? 0) + 1);
  const items = buildTeachingItems({ course, curricula: ["PDS0-2012|1"], legend: grid.legend, lessonCounts: counts });
  return { items, groups: groupTeachings(items) };
}

describe("letter groups", () => {
  it.each([
    ["Analisi matematica i exe a (stud. A-L)", { from: "A", to: "L" }],
    ["Analisi matematica I exe b (stud. lett M-Z)", { from: "M", to: "Z" }],
    ["Analisi matematica I exe c (stud. lett P-Z)", { from: "P", to: "Z" }],
    ["Chimica (info) exe b (stud. lett N-Z)", { from: "N", to: "Z" }],
    ["Chimica exe A (stud A-M)", { from: "A", to: "M" }],
    ["Informatica (mod. progrmmazione) exe C (stud. lett P-Z)", { from: "P", to: "Z" }],
    ["Economia e organizzazione aziendale exe A", null],
    ["E-commerce exe A", null],
  ])("%s", (name, expected) => {
    expect(parseLetterRange(name)).toEqual(expected);
  });

  it("detects exercises and their code prefix", () => {
    expect(isExerciseTeaching("EC41298_ES_B", "x")).toBe(true);
    expect(isExerciseTeaching("EC65744_Es_C", "x")).toBe(true);
    expect(isExerciseTeaching("EC41287_ES_Ed", "Chimica exe A")).toBe(true);
    expect(isExerciseTeaching("EC172165", "ANALISI MATEMATICA I")).toBe(false);
    expect(isExerciseTeaching("ECCCLENG_B1", "ADD LINGUA INGLESE B1 (CORSO B)")).toBe(false);
    expect(exercisePrefix("EC65744_Es_C")).toBe("EC65744");
    expect(exercisePrefix("EC41287_ES_Ed")).toBe("EC41287");
  });
});

describe("grouping", () => {
  it("deduplicates and attaches exercises to the main teaching by code or by name", () => {
    const { items, groups } = catalog();
    expect(items).toHaveLength(18);
    const byTitle = Object.fromEntries(groups.map((g) => [g.title, g.exercises.map((e) => e.code)]));
    expect(byTitle).toEqual({
      "ADD LINGUA INGLESE B1 (CORSO A)": [],
      "ADD LINGUA INGLESE B1 (CORSO B)": [],
      "ANALISI MATEMATICA I": ["EC41298_ES_B", "EC41298_ES_A", "EC41298_ES_C"],
      "Chimica – esercitazioni": ["EC41287_ES_B", "EC41287_ES_Ed"],
      "ECONOMIA ED ORGANIZZAZIONE AZIENDALE": ["EC172166_ES_A", "EC172166_ES_B"],
      "FISICA I": ["EC41294_ES_A", "EC41294_ES_B"],
      "FONDAMENTI DI PROGRAMMAZIONE": ["EC65744_ES_A", "EC65744_ES_B", "EC65744_Es_C"],
    });
  });

  it("carries period, type and lesson count", () => {
    const { items } = catalog();
    expect(items.find((i) => i.code === "EC172165")).toMatchObject({
      periodLabel: "Primo Semestre (S1)",
      periodPublished: true,
      required: true,
      lessonCount: 27,
      teacher: "M. Monti",
    });
    expect(items.find((i) => i.code === "ECCCLENGB1")?.required).toBe(false);
    expect(items.find((i) => i.code === "EC41298_ES_C")?.lessonCount).toBe(0);
  });

  it("suggests exercises from the surname initial", () => {
    const { groups } = catalog();
    const b = suggestExercises(groups, "b");
    expect([...b.selected].sort()).toEqual(["EC41287_ES_Ed", "EC41294_ES_A", "EC41298_ES_B", "EC65744_ES_A"]);
    expect(b.ambiguous).toEqual([]);
    expect(b.unknown).toEqual(["EC172166"]); // "exe A" / "exe B" without letters

    const r = suggestExercises(groups, "Rossi");
    expect([...r.selected].sort()).toEqual([
      "EC41287_ES_B",
      "EC41294_ES_B",
      "EC41298_ES_A",
      "EC41298_ES_C",
      "EC65744_ES_B",
      "EC65744_Es_C",
    ]);
    // R fits both M-Z and P-Z: flagged for manual check.
    expect(r.ambiguous.sort()).toEqual(["EC172165", "EC172346"]);

    expect(suggestExercises(groups, "").selected.size).toBe(0);
  });
});
