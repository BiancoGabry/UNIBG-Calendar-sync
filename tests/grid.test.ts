import { describe, expect, it } from "vitest";
import { buildGridForm, parseGridResponse, teachingPortalUrl } from "@/lib/easystaff/grid";
import { EasyStaffError } from "@/lib/easystaff/http";
import { addressFromMaps, normalizeGrid } from "@/lib/easystaff/normalize";
import { romeIso } from "@/lib/easystaff/time";
import { fixture, GRID_2025_JAN, GRID_2025_OCT, GRID_2026, GRID_2026_MULTI, GRID_2026_WEEK } from "./helpers";

const grid2026 = () => normalizeGrid(parseGridResponse(fixture(GRID_2026)));

describe("buildGridForm", () => {
  it("reproduces the browser payload with single txtcurr/all_events", () => {
    const form = buildGridForm({
      aa: "2026",
      course: "21-R",
      curricula: [{ value: "PDS0-2012|1", label: "1 - PERCORSO COMUNE" }],
      date: new Date("2026-09-25T10:00:00Z"),
    });
    expect(form.toString()).toBe(
      "view=easycourse&form-type=corso&include=corso&anno=2026&scuola=&corso=21-R&anno2%5B%5D=PDS0-2012%7C1" +
        "&visualizzazione_orario=cal&date=25-09-2026&periodo_didattico=&_lang=it&list=&week_grid_type=-1" +
        "&ar_codes_=&ar_select_=&col_cells=0&empty_box=0&only_grid=0&highlighted_date=0&all_events=1" +
        "&faculty_group=0&txtcurr=1+-+PERCORSO+COMUNE",
    );
  });

  it("repeats anno2[] for several curricula", () => {
    const form = buildGridForm({
      aa: "2026",
      course: "21-R",
      curricula: [
        { value: "PDS0-2012|1", label: "1 - PERCORSO COMUNE" },
        { value: "PDS0-2012|2", label: "2 - PERCORSO COMUNE" },
      ],
      date: "01-10-2026",
      allEvents: false,
    });
    expect(form.getAll("anno2[]")).toEqual(["PDS0-2012|1", "PDS0-2012|2"]);
    expect(form.get("all_events")).toBe("0");
    expect(form.get("date")).toBe("01-10-2026");
  });

  it("uses Europe/Rome for the date (23:30 UTC is already the next day in Rome)", () => {
    const form = buildGridForm({
      aa: "2026",
      course: "21-R",
      curricula: [{ value: "x|1", label: "x" }],
      date: new Date("2026-09-25T23:30:00Z"),
    });
    expect(form.get("date")).toBe("26-09-2026");
  });
});

describe("parseGridResponse", () => {
  it("validates the real response", () => {
    const g = parseGridResponse(fixture(GRID_2026));
    expect(g.celle).toHaveLength(239);
    expect(g.first_day).toBe("14-09-2026");
    expect(g.last_day).toBe("20-12-2026");
  });

  it("validates every saved variant", () => {
    for (const f of [GRID_2026_MULTI, GRID_2026_WEEK, GRID_2025_OCT, GRID_2025_JAN]) {
      expect(() => parseGridResponse(fixture(f))).not.toThrow();
    }
  });

  it("throws a validation error when a lesson loses an essential field", () => {
    const json = JSON.parse(fixture(GRID_2026));
    const lesson = json.celle.find((c: { tipo: string }) => c.tipo === "Lezione");
    delete lesson.codice_insegnamento;
    const err = (() => {
      try {
        parseGridResponse(JSON.stringify(json));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(EasyStaffError);
    expect((err as EasyStaffError).kind).toBe("validation");
  });

  it("throws a parse error on HTML instead of JSON", () => {
    expect(() => parseGridResponse("<html>errore</html>")).toThrow(/JSON non valido/);
  });
});

describe("normalizeGrid", () => {
  it("separates lessons from closures", () => {
    const n = grid2026();
    expect(n.lessons).toHaveLength(237);
    expect(n.closures).toEqual([
      {
        date: "2026-12-07",
        start: "2026-12-07T00:00:00+01:00",
        end: "2026-12-08T00:00:00+01:00",
        name: "Sospensione delle attività didattiche",
      },
      {
        date: "2026-12-08",
        start: "2026-12-08T00:00:00+01:00",
        end: "2026-12-09T00:00:00+01:00",
        name: "FESTIVITÀ: lezioni non previste",
      },
    ]);
    expect(n.warnings).toEqual([]); // every timestamp matches data + ora_inizio
  });

  it("builds a clean Lesson", () => {
    const lesson = grid2026().lessons.find((l) => l.sourceId === "927163")!;
    expect(lesson).toMatchObject({
      courseCode: "EC41298_ES_B",
      courseName: "Analisi matematica i exe a (stud. A-L)",
      title: "Analisi matematica i exe a (stud. A-L)",
      start: "2026-10-16T10:30:00+02:00",
      end: "2026-10-16T13:30:00+02:00",
      room: "A201 [Edificio A - Dalmine]",
      roomCode: "A201",
      site: "EDA-Dalmine",
      address: "Via Albert Einstein, 24044 Dalmine BG",
      teacher: "Tassetti Dario",
      kind: "Lezione",
      required: true,
      cancelled: true,
      notes: "",
    });
    expect(lesson.contentHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("counts the 24 cancelled lessons", () => {
    expect(grid2026().lessons.filter((l) => l.cancelled)).toHaveLength(24);
  });

  it("uses titolo_lezione when it differs and merges notes", () => {
    const l = grid2026().lessons.find((x) => x.title !== x.courseName)!;
    expect(l.title).toBe("Economia e organizzazione aziendale exe a gruppi uniti");
    expect(l.courseName).toBe("Economia e organizzazione aziendale exe A");
    expect(l.notes).toBe("EXE A GRUPPI UNITI");
    const english = grid2026().lessons.find((x) => x.courseCode === "ECCCLENGB1")!;
    expect(english.required).toBe(false);
    expect(english.notes).toMatch(/^I corsi di inglese sono propedeutici/);
  });

  it("converts times across the end-of-October DST change", () => {
    expect(romeIso("23-10-2026", "09:00")).toBe("2026-10-23T09:00:00+02:00");
    expect(romeIso("25-10-2026", "09:00")).toBe("2026-10-25T09:00:00+01:00");
    expect(romeIso("26-10-2026", "14:00")).toBe("2026-10-26T14:00:00+01:00");
    expect(romeIso("25-10-2026", "24:00")).toBe("2026-10-26T00:00:00+01:00");
    const n = grid2026();
    const before = n.lessons.filter((l) => l.start < "2026-10-25").every((l) => l.start.endsWith("+02:00"));
    const after = n.lessons.filter((l) => l.start > "2026-10-26").every((l) => l.start.endsWith("+01:00"));
    expect(before && after).toBe(true);
  });

  it("returns the covered window, legend and file date", () => {
    const n = grid2026();
    expect(n.window).toEqual({
      start: "2026-09-14T00:00:00+02:00",
      end: "2026-12-21T00:00:00+01:00",
      firstDay: "2026-09-14",
      lastDay: "2026-12-20",
    });
    expect(n.fileDate).toBe("25-09-2026 19:20");
    expect(n.legend).toHaveLength(18);
    expect(n.legend.find((l) => l.code === "ECCCLENG_B1")).toEqual({
      code: "ECCCLENG_B1",
      name: "ADD LINGUA INGLESE B1 (CORSO B)",
      required: false,
    });
    expect(n.periods).toEqual([{ year: "1", label: "Primo Semestre", start: "2026-09-14", end: "2026-12-19" }]);
  });

  it("deduplicates closures repeated for each curriculum", () => {
    const n = normalizeGrid(parseGridResponse(fixture(GRID_2026_MULTI)));
    // 372 "Lezione" + 1 "Recupero lezione" + 1 "Tutorato"
    expect(n.lessons).toHaveLength(374);
    expect(n.closures).toHaveLength(2);
    expect(new Set(n.lessons.map((l) => l.kind))).toEqual(new Set(["Lezione", "Recupero lezione", "Tutorato"]));
  });

  it("keeps non-lesson kinds (Tutorato, Prova in itinere) and fixes mojibake", () => {
    const n = normalizeGrid(parseGridResponse(fixture(GRID_2025_OCT)));
    // 431 "Lezione" + 20 Tutorato / Prova in itinere / Recupero lezione
    expect(n.lessons).toHaveLength(451);
    expect(n.window.firstDay).toBe("2025-09-15");
    expect(n.window.lastDay).toBe("2026-06-14");
    expect(new Set(n.lessons.map((l) => l.kind))).toEqual(
      new Set(["Lezione", "Tutorato", "Prova in itinere", "Recupero lezione"]),
    );
    expect(JSON.stringify(n)).not.toMatch(/Ã/);
  });

  it("is deterministic (same input → same hashes)", () => {
    expect(grid2026().lessons.map((l) => l.contentHash)).toEqual(grid2026().lessons.map((l) => l.contentHash));
  });
});

describe("helpers", () => {
  it("extracts the address from the maps iframe", () => {
    expect(
      addressFromMaps(
        '<iframe src="https://www.google.com/maps/embed?pb=!1m18!3m3!1m2!1s0x4781%3A0x80a8!2sVia+Pasubio%2C+7%2C+24044+Dalmine+BG!5e0!3m2!1sit!2sit!4v1" width="600"></iframe>',
      ),
    ).toBe("Via Pasubio, 7, 24044 Dalmine BG");
    expect(addressFromMaps("")).toBe("");
  });

  it("links a teaching to its portal timetable", () => {
    expect(teachingPortalUrl("https://logistica.unibg.it/PortaleStudenti/", "2026", "EC172165")).toBe(
      "https://logistica.unibg.it/PortaleStudenti/index.php?view=easycourse&include=attivita&anno=2026&attivita%5B%5D=EC172165&_lang=it",
    );
  });
});
