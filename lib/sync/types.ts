// Core domain types shared by normalisation, diff, planning and UI.

export type Lesson = {
  sourceId: string; // cella.id
  courseCode: string; // codice_insegnamento
  courseName: string; // nome_insegnamento (clean text)
  title: string; // titolo_lezione || nome_insegnamento (clean text)
  start: string; // ISO with offset, Europe/Rome
  end: string;
  room: string; // "A001 [Edificio A - Dalmine]"
  roomCode: string; // "A001"
  site: string; // "EDA-Dalmine"
  address: string; // from the maps iframe, "" if unknown
  teacher: string;
  kind: string; // tipo: "Lezione", "Tutorato", "Prova in itinere", ...
  required: boolean; // insegnamento_tipo includes "Obbligatorio"
  cancelled: boolean; // Annullato === "1"
  notes: string;
  contentHash: string; // hash of every field above except sourceId
};

export type LessonContent = Omit<Lesson, "sourceId" | "contentHash">;

export type Closure = {
  date: string; // yyyy-MM-dd
  start: string;
  end: string;
  name: string;
};

export type SnapshotStatus = "active" | "cancelled" | "removed";

/** What the app believes is currently written on Google for one lesson. */
export type SnapshotEntry = {
  sourceId: string;
  googleEventId: string;
  contentHash: string;
  eventHash: string;
  status: SnapshotStatus;
  lesson: Lesson;
  cancelledAt: string | null;
  removedAt: string | null;
};

export type FieldName =
  "title" | "courseName" | "date" | "time" | "room" | "address" | "teacher" | "kind" | "required" | "notes";

export type FieldChange = { field: FieldName; from: string; to: string };

export type Action =
  | { type: "insert"; lesson: Lesson }
  | {
      type: "patch";
      lesson: Lesson;
      prev: SnapshotEntry;
      changes: FieldChange[];
      transition: "cancelled" | "restored" | "reappeared" | null;
    }
  | { type: "markRemoved"; prev: SnapshotEntry }
  | { type: "move"; prev: SnapshotEntry; lesson: Lesson }
  | { type: "delete"; prev: SnapshotEntry; reason: "deselected" };

export type Selection = {
  courses: ReadonlySet<string>;
  includeRecommended: boolean;
};

export type Window = { start: string; end: string };
