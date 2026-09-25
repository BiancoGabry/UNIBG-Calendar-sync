// Human-readable change log lines (Italian). Pure.
import * as f from "./format";
import type { Action, FieldChange } from "./types";

const FIELD_LABEL: Record<FieldChange["field"], string> = {
  title: "titolo",
  courseName: "insegnamento",
  date: "data",
  time: "orario",
  room: "aula",
  address: "indirizzo",
  teacher: "docente",
  kind: "tipo",
  required: "tipo insegnamento",
  notes: "note",
};

const show = (v: string) => (v === "" ? "—" : v.replace(/\s*\n\s*/g, " / "));

export function describeChanges(changes: FieldChange[]): string {
  return changes.map((c) => `${FIELD_LABEL[c.field]} ${show(c.from)} → ${show(c.to)}`).join("; ");
}

/** e.g. "FISICA I – ven 16/10 09:00: aula D001 → B201" */
export function describeAction(a: Action): string {
  switch (a.type) {
    case "insert":
      return `Nuova lezione: ${a.lesson.title} – ${f.dayTime(a.lesson.start)}${a.lesson.cancelled ? " (già annullata)" : ""}`;
    case "patch": {
      const head = `${a.prev.lesson.title} – ${f.dayTime(a.prev.lesson.start)}`;
      const changes = a.changes.length ? describeChanges(a.changes) : "";
      if (a.transition === "cancelled") return `${head}: annullata${changes ? ` (${changes})` : ""}`;
      if (a.transition === "restored") return `${head}: di nuovo in programma${changes ? ` (${changes})` : ""}`;
      if (a.transition === "reappeared")
        return `${head}: di nuovo presente nell'orario${changes ? ` (${changes})` : ""}`;
      return `${head}: ${changes || "dettagli aggiornati"}`;
    }
    case "markRemoved":
      return `${a.prev.lesson.title} – ${f.dayTime(a.prev.lesson.start)}: rimossa dall'orario`;
    case "move":
      return `${a.lesson.title}: spostata da ${f.dayTime(a.prev.lesson.start)} a ${f.dayTime(a.lesson.start)}`;
    case "delete":
      return `${a.prev.lesson.title} – ${f.dayTime(a.prev.lesson.start)}: evento eliminato (insegnamento non più selezionato)`;
  }
}
