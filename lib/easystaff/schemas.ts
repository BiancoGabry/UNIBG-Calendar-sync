// Zod schemas for the (undocumented) EasyStaff Agenda Web responses.
// Built from the real fixtures in /fixtures. Only essential fields are required;
// everything else is optional because closure cells and older data omit them.
import { z } from "zod";

/** String field that may be missing, null or numeric in the payload. Always yields a string. */
const looseString = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null ? "" : String(v)));

const idString = z.union([z.string().min(1), z.number()]).transform(String);

const ddmmyyyy = z.string().regex(/^\d{2}-\d{2}-\d{4}$/, "data attesa nel formato dd-mm-yyyy");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "ora attesa nel formato HH:MM");

// PHP serialises an empty associative array as `[]`, so records may arrive as arrays.
const phpRecord = <T extends z.ZodType>(value: T) =>
  z
    .union([z.record(z.string(), value), z.array(value)])
    .transform((v) => (Array.isArray(v) ? Object.fromEntries(v.map((item, i) => [String(i), item])) : v));

// ---------------------------------------------------------------------------
// combo.php?sw=ec_&aa=1  →  var anni_accademici_ec = {...};

export const academicYearSchema = z.object({
  label: z.string(),
  valore: z.string(),
});

export const academicYearsSchema = z.object({
  anni_accademici_ec: phpRecord(academicYearSchema),
});

// ---------------------------------------------------------------------------
// combo.php?sw=ec_&aa=<aa>&page=corsi  →  var elenco_corsi = [...]; var elenco_scuole = [...];

export const periodSchema = z.object({
  label: z.string(),
  valore: z.string(),
  pub: looseString,
  id: idString,
  aa_id: looseString,
  facolta_code: looseString,
});

export const teachingSchema = z.object({
  label: z.string(),
  valore: z.string(),
  id: looseString,
  id_periodo: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v == null || v === "" ? null : String(v))),
  docente: looseString,
});

export const courseYearSchema = z.object({
  label: z.string(),
  valore: z.string(),
  order_lbl: looseString,
  external: z.union([z.number(), z.string()]).nullish(),
  elenco_insegnamenti: z.array(teachingSchema).default([]),
  elenco_canali: z.array(z.unknown()).default([]),
});

export const degreeCourseSchema = z.object({
  label: z.string(),
  valore: z.string(),
  tipo: looseString,
  TipoID: looseString,
  cdl_id: looseString,
  scuola: looseString,
  pub_type: looseString,
  default_grid: looseString,
  facolta_id: looseString,
  facolta_code: looseString,
  periodi: z.array(periodSchema).default([]),
  pub_periodi: z.array(periodSchema).default([]),
  elenco_anni: z.array(courseYearSchema).default([]),
});

export const schoolSchema = z.object({
  label: z.string(),
  valore: z.string(),
  id: looseString,
});

export const coursesComboSchema = z.object({
  elenco_corsi: z.array(degreeCourseSchema),
  elenco_scuole: z.array(schoolSchema).default([]),
});

// ---------------------------------------------------------------------------
// grid_call.php

export const closureCellSchema = z.object({
  tipo: z.literal("chiusura_type"),
  nome: looseString,
  data: ddmmyyyy,
  ora_inizio: hhmm,
  ora_fine: hhmm,
  timestamp: z.number().optional(),
  giorno: looseString,
});

export const lessonCellSchema = z.object({
  id: idString,
  codice_insegnamento: z.string().min(1),
  nome_insegnamento: z.string(),
  data: ddmmyyyy,
  ora_inizio: hhmm,
  ora_fine: hhmm,
  timestamp: z.number(),
  tipo: z.string().min(1), // "Lezione", "Tutorato", "Prova in itinere", "Recupero lezione", ...
  codice_tipo: looseString,
  Annullato: looseString,
  titolo_lezione: looseString,
  name_original: looseString,
  aula: looseString,
  codice_aula: looseString,
  codice_sede: looseString,
  docente: looseString,
  codice_docente: looseString,
  insegnamento_tipo: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  percorso_didattico: looseString,
  notes: looseString,
  note_easyroom: looseString,
  NoteOrario: looseString,
  NoteAula: looseString,
  NoteSettimanali: looseString,
  CodiceCombinato: looseString,
  maps: looseString,
});

export const gridCellSchema = z.union([closureCellSchema, lessonCellSchema]);

export const legendEntrySchema = z.object({
  codice: z.string(),
  nome: looseString,
  spunta: looseString,
  tipo: looseString, // "Obbligatorio" | "Consigliato"
  codice_siadi: looseString,
});

export const curriculumDatesSchema = z.object({
  AnnoCorso: looseString,
  DataInizio: looseString,
  DataFine: looseString,
  PeriodoDidattico: looseString,
});

export const gridResponseSchema = z.object({
  aa: looseString,
  anno_accademico: looseString,
  cds: looseString,
  anno2: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  all_events: z.union([z.number(), z.string()]).nullish(),
  data: looseString,
  first_day: ddmmyyyy,
  last_day: ddmmyyyy,
  file_timestamp: z.number().nullish(),
  file_date: looseString,
  date_inizio_fine_curriculum: z
    .array(z.object({ date: phpRecord(curriculumDatesSchema).optional() }))
    .nullish()
    .transform((v) => v ?? []),
  legenda: z
    .array(legendEntrySchema)
    .nullish()
    .transform((v) => v ?? []),
  note_generali: z
    .array(z.object({ nota: looseString }))
    .nullish()
    .transform((v) => v ?? []),
  celle: z.array(gridCellSchema),
});

export type AcademicYearRaw = z.infer<typeof academicYearSchema>;
export type PeriodRaw = z.infer<typeof periodSchema>;
export type TeachingRaw = z.infer<typeof teachingSchema>;
export type CourseYearRaw = z.infer<typeof courseYearSchema>;
export type DegreeCourseRaw = z.infer<typeof degreeCourseSchema>;
export type SchoolRaw = z.infer<typeof schoolSchema>;
export type CoursesCombo = z.infer<typeof coursesComboSchema>;
export type ClosureCell = z.infer<typeof closureCellSchema>;
export type LessonCell = z.infer<typeof lessonCellSchema>;
export type LegendEntryRaw = z.infer<typeof legendEntrySchema>;
export type GridResponse = z.infer<typeof gridResponseSchema>;
