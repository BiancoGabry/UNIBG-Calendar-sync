"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SchedulePreview } from "@/components/preview/schedule-preview";
import { dayLabel } from "@/components/preview/time";
import type { WizardDetails, WizardState } from "./types";

export function StepPreview({ state, details }: { state: WizardState; details: WizardDetails }) {
  const selected = new Set(state.selected);
  const lessons = details.lessons.filter(
    (l) => selected.has(l.courseCode) && (state.options.includeRecommended || l.required),
  );
  const names = Object.fromEntries(
    details.groups.flatMap((g) => [...(g.main ? [g.main] : []), ...g.exercises]).map((i) => [i.code, i.name]),
  );

  if (!details.published) {
    return (
      <Alert>
        <AlertTitle>Orario non ancora pubblicato</AlertTitle>
        <AlertDescription>
          Non ci sono lezioni da mostrare: verranno sincronizzate appena EasyStaff le pubblica.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {details.window && (
          <span>
            Periodo coperto: {dayLabel(details.window.firstDay, "d MMM")} –{" "}
            {dayLabel(details.window.lastDay, "d MMM yyyy")}
          </span>
        )}
        {details.periods.map((p) => (
          <span key={`${p.year}${p.label}`}>
            {p.label} (anno {p.year}): {dayLabel(p.start, "dd/MM")} – {dayLabel(p.end, "dd/MM")}
          </span>
        ))}
        {details.fileDate && <span>Ultimo aggiornamento orario: {details.fileDate}</span>}
        <span>
          {lessons.length} lezioni, di cui {lessons.filter((l) => l.cancelled).length} annullate
        </span>
      </div>
      {details.generalNotes.length > 0 && (
        <Alert>
          <AlertTitle>Note del corso</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{details.generalNotes.join("\n")}</AlertDescription>
        </Alert>
      )}
      <SchedulePreview lessons={lessons} closures={details.closures} courseNames={names} />
    </div>
  );
}
