import { describe, expect, it } from "vitest";
import { parseJsVars } from "@/lib/easystaff/jsvars";
import { OTHER_SCHOOL, parseAcademicYears, parseCourses, summarizeCatalog } from "@/lib/easystaff/combo";
import { EasyStaffError } from "@/lib/easystaff/http";
import { fixture } from "./helpers";

describe("parseJsVars", () => {
  it("extracts every var and ignores aliases", () => {
    const vars = parseJsVars('var a = [1,{"x":"y;z"}];var alias = a;var b = {"k":1};');
    expect(Object.keys(vars)).toEqual(["a", "b"]);
    expect(vars.a).toEqual([1, { x: "y;z" }]);
  });

  it("handles no spaces and newlines", () => {
    expect(parseJsVars('var a=[\n 1\n];\nvar b={"c":2}')).toEqual({ a: [1], b: { c: 2 } });
  });

  it("rejects non-JSON literals instead of evaluating them", () => {
    expect(() => parseJsVars("var a = alert(1) + 2;")).toThrow(/JSON non valido/);
  });
});

describe("combo.php anni", () => {
  it("parses the real payload, newest first", () => {
    const years = parseAcademicYears(fixture("combo_anni.js"));
    expect(years).toEqual([
      { value: "2026", label: "2026/2027" },
      { value: "2025", label: "2025/2026" },
      { value: "2024", label: "2024/2025" },
    ]);
  });

  it("fails with a validation error on unexpected structure", () => {
    expect(() => parseAcademicYears('var anni_accademici_ec = {"2026":{"x":1}};')).toThrow(EasyStaffError);
  });
});

describe("combo.php corsi", () => {
  for (const file of ["combo_corsi_2026.js", "combo_corsi_2026_raw.js"]) {
    it(`parses ${file} (pretty and minified) and ignores elenco_cdl`, () => {
      const combo = parseCourses(fixture(file));
      expect(combo.elenco_corsi).toHaveLength(80);
      expect(combo).not.toHaveProperty("elenco_cdl");
      expect(combo.elenco_scuole.find((s) => s.id === "3")).toMatchObject({
        label: "Scuola di Ingegneria",
        valore: "ScuoladiIngegneria",
      });
      const info = combo.elenco_corsi.find((c) => c.valore === "21-R")!;
      expect(info).toMatchObject({ label: "INGEGNERIA INFORMATICA", tipo: "Laurea", scuola: "ScuoladiIngegneria" });
      expect(info.pub_periodi.map((p) => p.valore)).toEqual(["S1"]);
      const year1 = info.elenco_anni.find((y) => y.valore === "PDS0-2012|1")!;
      expect(year1.label).toBe("1 - PERCORSO COMUNE");
      expect(year1.elenco_insegnamenti).toHaveLength(18);
      expect(year1.elenco_insegnamenti[0]).toEqual({
        label: "ANALISI MATEMATICA I",
        valore: "EC172165",
        id: "91825",
        id_periodo: "208",
        docente: "M. Monti",
      });
    });
  }

  it("summarises the catalogue for the UI", () => {
    const summary = summarizeCatalog(parseCourses(fixture("combo_corsi_2026_raw.js")));
    const info = summary.courses.find((c) => c.value === "21-R")!;
    expect(info.published).toBe(true);
    expect(info.curricula.map((c) => [c.value, c.year])).toEqual([
      ["PDS0-2012|1", "1"],
      ["PDS0-2012|2", "2"],
    ]);
    expect(info.periods).toEqual([{ id: "208", code: "S1", label: "Primo Semestre (S1)", published: true }]);
    // Two courses with empty pub_periodi: timetable not published yet.
    expect(summary.courses.filter((c) => !c.published)).toHaveLength(2);
    expect(summary.courses.every((c) => c.school !== OTHER_SCHOOL)).toBe(true);
  });
});
