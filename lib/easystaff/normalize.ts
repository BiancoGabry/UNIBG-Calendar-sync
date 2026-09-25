// grid_call.php response → clean domain objects (Lesson, Closure, legend, window).
import type { Closure, Lesson, LessonContent } from "@/lib/sync/types";
import { hashOf } from "@/lib/sync/hash";
import type { ClosureCell, GridResponse, LessonCell } from "./schemas";
import { fixMojibake, htmlToLine, htmlToText } from "./text";
import { ddmmyyyyToIsoDate, romeDate, romeIso, toRomeIso } from "./time";

export type LegendItem = {
  code: string;
  name: string;
  required: boolean | null; // null when the legend does not say
};

export type CurriculumPeriod = {
  year: string; // AnnoCorso
  label: string; // "Primo Semestre"
  start: string; // yyyy-MM-dd
  end: string;
};

export type NormalizedGrid = {
  aa: string;
  academicYearLabel: string;
  course: string;
  curricula: string[];
  window: { start: string; end: string; firstDay: string; lastDay: string };
  fileDate: string;
  fileTimestamp: number | null;
  periods: CurriculumPeriod[];
  legend: LegendItem[];
  lessons: Lesson[];
  closures: Closure[];
  generalNotes: string[];
  warnings: string[];
};

export function contentHash(content: LessonContent): string {
  return hashOf(content);
}

/** Address from the Google Maps embed URL: "...!2sVia+Albert+Einstein%2C+24044+Dalmine+BG!5e0..." */
export function addressFromMaps(maps: string): string {
  if (!maps) return "";
  const src = maps.match(/src="([^"]+)"/)?.[1] ?? maps;
  for (const m of src.matchAll(/!2s([^!"&]+)/g)) {
    try {
      const text = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
      if (text.length > 3 && /\d|\s/.test(text)) return fixMojibake(text);
    } catch {
      // malformed escape: ignore
    }
  }
  return "";
}

function joinNotes(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const clean = htmlToText(p);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out.join("\n");
}

export function isClosureCell(cell: GridResponse["celle"][number]): cell is ClosureCell {
  return cell.tipo === "chiusura_type";
}

export function normalizeLesson(cell: LessonCell, warnings?: string[]): Lesson {
  const start = romeDate(cell.data, cell.ora_inizio);
  const end = romeDate(cell.data, cell.ora_fine);
  if (warnings && start.getTime() !== cell.timestamp * 1000) {
    warnings.push(
      `Lezione ${cell.id}: timestamp ${cell.timestamp} non coincide con ${cell.data} ${cell.ora_inizio} (uso data e ora)`,
    );
  }
  const courseName = htmlToLine(cell.nome_insegnamento);
  const content: LessonContent = {
    courseCode: cell.codice_insegnamento,
    courseName,
    title: htmlToLine(cell.titolo_lezione) || courseName,
    start: toRomeIso(start),
    end: toRomeIso(end),
    room: htmlToLine(cell.aula),
    roomCode: htmlToLine(cell.codice_aula),
    site: htmlToLine(cell.codice_sede),
    address: addressFromMaps(cell.maps),
    teacher: htmlToLine(cell.docente),
    kind: htmlToLine(cell.tipo),
    required: cell.insegnamento_tipo.includes("Obbligatorio"),
    cancelled: cell.Annullato === "1",
    notes: joinNotes([cell.notes, cell.NoteOrario, cell.NoteAula, cell.NoteSettimanali]),
  };
  return { sourceId: cell.id, ...content, contentHash: contentHash(content) };
}

export function normalizeClosure(cell: ClosureCell): Closure {
  return {
    date: ddmmyyyyToIsoDate(cell.data),
    start: romeIso(cell.data, cell.ora_inizio),
    end: romeIso(cell.data, cell.ora_fine),
    name: htmlToLine(cell.nome),
  };
}

export function normalizeGrid(grid: GridResponse): NormalizedGrid {
  const warnings: string[] = [];
  const lessons = new Map<string, Lesson>();
  const closures = new Map<string, Closure>();

  for (const cell of grid.celle) {
    if (isClosureCell(cell)) {
      const c = normalizeClosure(cell);
      closures.set(`${c.start}|${c.name}`, c); // duplicated once per curriculum
    } else {
      const lesson = normalizeLesson(cell, warnings);
      if (lessons.has(lesson.sourceId) && lessons.get(lesson.sourceId)!.contentHash !== lesson.contentHash) {
        warnings.push(`Lezione ${lesson.sourceId} presente due volte con contenuto diverso`);
      }
      lessons.set(lesson.sourceId, lesson);
    }
  }

  const periods = new Map<string, CurriculumPeriod>();
  for (const block of grid.date_inizio_fine_curriculum) {
    for (const d of Object.values(block.date ?? {})) {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(d.DataInizio) || !/^\d{2}-\d{2}-\d{4}$/.test(d.DataFine)) continue;
      const p: CurriculumPeriod = {
        year: d.AnnoCorso,
        label: fixMojibake(d.PeriodoDidattico),
        start: ddmmyyyyToIsoDate(d.DataInizio),
        end: ddmmyyyyToIsoDate(d.DataFine),
      };
      periods.set(`${p.year}|${p.label}|${p.start}|${p.end}`, p);
    }
  }

  const legend = new Map<string, LegendItem>();
  for (const l of grid.legenda) {
    legend.set(l.codice, {
      code: l.codice,
      name: htmlToLine(l.nome),
      required: l.tipo === "Obbligatorio" ? true : l.tipo === "Consigliato" ? false : null,
    });
  }

  const sortedLessons = [...lessons.values()].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.sourceId.localeCompare(b.sourceId),
  );

  return {
    aa: grid.aa,
    academicYearLabel: grid.anno_accademico,
    course: grid.cds,
    curricula: grid.anno2,
    window: {
      start: romeIso(grid.first_day, "00:00"),
      end: romeIso(grid.last_day, "24:00"),
      firstDay: ddmmyyyyToIsoDate(grid.first_day),
      lastDay: ddmmyyyyToIsoDate(grid.last_day),
    },
    fileDate: grid.file_date,
    fileTimestamp: grid.file_timestamp ?? null,
    periods: [...periods.values()],
    legend: [...legend.values()],
    lessons: sortedLessons,
    closures: [...closures.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    generalNotes: [...new Set(grid.note_generali.map((n) => htmlToText(n.nota)).filter(Boolean))],
    warnings,
  };
}
