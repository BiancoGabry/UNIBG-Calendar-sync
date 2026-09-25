// Lesson + state → Google Calendar event body. Pure and deterministic, so the body
// hash tells whether Google already holds exactly this event.
import { teachingPortalUrl } from "@/lib/easystaff/grid";
import { TZ } from "@/lib/easystaff/time";
import * as f from "./format";
import { hashOf } from "./hash";
import type { Lesson, SnapshotStatus } from "./types";

export const SOURCE_TAG = "unibg-sync";
export const CANCELLED_COLOR = "11"; // Tomato
export const REMOVED_COLOR = "8"; // Graphite

export type ReminderOption = { mode: "none" } | { mode: "default" } | { mode: "minutes"; minutes: number };

export type EventOptions = {
  titlePrefix: "never" | "nonLesson" | "always";
  reminder: ReminderOption;
  includeRecommended: boolean;
  colorId: string | null;
};

export const DEFAULT_EVENT_OPTIONS: EventOptions = {
  titlePrefix: "nonLesson",
  reminder: { mode: "default" },
  includeRecommended: true,
  colorId: null,
};

export type RenderContext = {
  configId: string;
  aa: string;
  portalBaseUrl: string;
  options: EventOptions;
};

export type EventState = {
  lesson: Lesson;
  status: SnapshotStatus;
  cancelledAt: string | null;
  removedAt: string | null;
};

/** Subset of calendar_v3.Schema$Event written by the app. */
export type EventBody = {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  colorId?: string;
  transparency: "opaque" | "transparent";
  status: "confirmed";
  reminders: { useDefault: boolean; overrides?: { method: "popup"; minutes: number }[] };
  source: { title: string; url: string };
  extendedProperties: { private: Record<string, string> };
};

export function baseTitle(lesson: Lesson, options: EventOptions): string {
  const prefix = options.titlePrefix === "always" || (options.titlePrefix === "nonLesson" && lesson.kind !== "Lezione");
  return prefix && lesson.kind ? `[${lesson.kind}] ${lesson.title}` : lesson.title;
}

export function renderEvent(state: EventState, ctx: RenderContext): { body: EventBody; eventHash: string } {
  const { lesson } = state;
  const removed = state.status === "removed";
  const cancelled = !removed && lesson.cancelled;
  const portalUrl = teachingPortalUrl(ctx.portalBaseUrl, ctx.aa, lesson.courseCode);
  const title = baseTitle(lesson, ctx.options);

  const lines: string[] = [];
  if (removed) {
    lines.push(`Lezione rimossa dall'orario (rilevato il ${f.dateTime(state.removedAt ?? lesson.start)})`, "");
  } else if (cancelled) {
    lines.push(`Lezione annullata (rilevato il ${f.dateTime(state.cancelledAt ?? lesson.start)})`, "");
  }
  if (lesson.title !== lesson.courseName) lines.push(`Insegnamento: ${lesson.courseName}`);
  if (lesson.teacher) lines.push(`Docente: ${lesson.teacher}`);
  lines.push(`Tipo: ${lesson.kind} · ${lesson.required ? "Obbligatorio" : "Consigliato"}`);
  if (lesson.room) lines.push(`Aula: ${lesson.room}`);
  if (lesson.notes) lines.push(`Note: ${lesson.notes}`);
  lines.push(`Orario dell'insegnamento: ${portalUrl}`, "", `Sincronizzato da ${SOURCE_TAG}`);

  const location = [lesson.room, lesson.address].filter(Boolean).join(", ");
  const colorId = removed ? REMOVED_COLOR : cancelled ? CANCELLED_COLOR : (ctx.options.colorId ?? undefined);
  const r = ctx.options.reminder;

  const body: EventBody = {
    summary: removed ? `⚠️ RIMOSSA – ${title}` : cancelled ? `❌ ANNULLATA – ${title}` : title,
    description: lines.join("\n"),
    ...(location ? { location } : {}),
    start: { dateTime: lesson.start, timeZone: TZ },
    end: { dateTime: lesson.end, timeZone: TZ },
    ...(colorId ? { colorId } : {}),
    transparency: removed || cancelled ? "transparent" : "opaque",
    status: "confirmed",
    reminders:
      r.mode === "default"
        ? { useDefault: true }
        : { useDefault: false, overrides: r.mode === "minutes" ? [{ method: "popup", minutes: r.minutes }] : [] },
    source: { title: "UniBG Agenda Web", url: portalUrl },
    extendedProperties: {
      private: {
        source: SOURCE_TAG,
        configId: ctx.configId,
        sourceId: lesson.sourceId,
        contentHash: lesson.contentHash,
        courseCode: lesson.courseCode,
      },
    },
  };
  return { body, eventHash: hashOf(body) };
}
