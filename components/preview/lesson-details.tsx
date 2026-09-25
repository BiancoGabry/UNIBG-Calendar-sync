import type { Lesson } from "@/lib/sync/types";
import { romeTime } from "./time";

export function LessonDetails({ lesson }: { lesson: Lesson }) {
  return (
    <div className="max-w-xs space-y-1 text-xs">
      <div className="font-semibold">{lesson.title}</div>
      {lesson.title !== lesson.courseName && <div className="opacity-80">{lesson.courseName}</div>}
      <div>
        {romeTime(lesson.start)}–{romeTime(lesson.end)} · {lesson.kind}
        {lesson.required ? "" : " · consigliato"}
      </div>
      {lesson.room && <div>Aula: {lesson.room}</div>}
      {lesson.teacher && <div>Docente: {lesson.teacher}</div>}
      {lesson.notes && <div className="whitespace-pre-line">Note: {lesson.notes}</div>}
      {lesson.cancelled && <div className="font-semibold">Lezione annullata</div>}
    </div>
  );
}
