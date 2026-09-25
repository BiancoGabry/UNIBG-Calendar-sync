import type { CourseDetails } from "@/app/actions/catalog";
import type { EventOptions } from "@/lib/sync/event";

export type CurriculumRef = { value: string; label: string };

export type WizardState = {
  id: string | null;
  aa: string;
  aaLabel: string;
  school: string;
  courseCode: string;
  courseLabel: string;
  curricula: CurriculumRef[];
  selected: string[];
  surnameInitial: string;
  calendarId: string | null;
  calendarName: string | null;
  calendarColor: string | null;
  options: EventOptions;
  status: "draft" | "active" | "paused" | "error";
};

export type WizardDetails = CourseDetails & { key: string };

export const STEPS = ["Corso", "Insegnamenti", "Anteprima", "Calendario", "Opzioni", "Riepilogo"] as const;

export const detailsKey = (s: Pick<WizardState, "aa" | "courseCode" | "curricula">) =>
  `${s.aa}|${s.courseCode}|${s.curricula
    .map((c) => c.value)
    .sort()
    .join(",")}`;

/** Google Calendar event colours (colorId → name, hex). */
export const EVENT_COLORS: { id: string; name: string; hex: string }[] = [
  { id: "1", name: "Lavanda", hex: "#7986cb" },
  { id: "2", name: "Salvia", hex: "#33b679" },
  { id: "3", name: "Uva", hex: "#8e24aa" },
  { id: "4", name: "Fenicottero", hex: "#e67c73" },
  { id: "5", name: "Banana", hex: "#f6bf26" },
  { id: "6", name: "Mandarino", hex: "#f4511e" },
  { id: "7", name: "Pavone", hex: "#039be5" },
  { id: "8", name: "Grafite", hex: "#616161" },
  { id: "9", name: "Mirtillo", hex: "#3f51b5" },
  { id: "10", name: "Basilico", hex: "#0b8043" },
  { id: "11", name: "Pomodoro", hex: "#d50000" },
];
