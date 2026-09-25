"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Closure, Lesson } from "@/lib/sync/types";
import { dotClass, hueStyle } from "./colors";
import { dayLabel, romeDayKey, romeTime } from "./time";

type Row = { kind: "lesson"; lesson: Lesson; day: string } | { kind: "closure"; closure: Closure; day: string };

export function ListView({
  lessons,
  closures,
  hues,
}: {
  lessons: Lesson[];
  closures: Closure[];
  hues: Map<string, number>;
}) {
  const rows: Row[] = [
    ...lessons.map((l) => ({ kind: "lesson" as const, lesson: l, day: romeDayKey(l.start) })),
    ...closures.map((c) => ({ kind: "closure" as const, closure: c, day: c.date })),
  ].sort((a, b) =>
    a.day === b.day
      ? (a.kind === "closure" ? "" : a.lesson.start).localeCompare(b.kind === "closure" ? "" : b.lesson.start)
      : a.day.localeCompare(b.day),
  );

  if (rows.length === 0) return <p className="text-muted-foreground p-4 text-sm">Nessuna lezione da mostrare.</p>;

  return (
    <div className="max-h-[560px] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0">
          <TableRow>
            <TableHead className="w-28">Giorno</TableHead>
            <TableHead className="w-24">Orario</TableHead>
            <TableHead>Insegnamento</TableHead>
            <TableHead>Aula</TableHead>
            <TableHead>Docente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) =>
            r.kind === "closure" ? (
              <TableRow key={`c${i}`} className="bg-muted/60">
                <TableCell className="capitalize">{dayLabel(r.day)}</TableCell>
                <TableCell colSpan={4} className="text-muted-foreground italic">
                  {r.closure.name}
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={r.lesson.sourceId} className={cn(r.lesson.cancelled && "text-muted-foreground")}>
                <TableCell className="capitalize">{dayLabel(r.day)}</TableCell>
                <TableCell className="tabular-nums">
                  {romeTime(r.lesson.start)}–{romeTime(r.lesson.end)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", dotClass)}
                      style={hueStyle(hues.get(r.lesson.courseCode))}
                    />
                    <span className={cn(r.lesson.cancelled && "line-through")}>{r.lesson.title}</span>
                    {r.lesson.cancelled && <Badge variant="destructive">Annullata</Badge>}
                    {r.lesson.kind !== "Lezione" && <Badge variant="outline">{r.lesson.kind}</Badge>}
                  </div>
                  {r.lesson.notes && <div className="text-muted-foreground mt-0.5 text-xs">{r.lesson.notes}</div>}
                </TableCell>
                <TableCell>{r.lesson.room}</TableCell>
                <TableCell>{r.lesson.teacher}</TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
