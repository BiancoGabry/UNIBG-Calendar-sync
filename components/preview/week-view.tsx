"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Closure, Lesson } from "@/lib/sync/types";
import { chipClass, hueStyle } from "./colors";
import { LessonDetails } from "./lesson-details";
import { addDaysKey, dayLabel, romeDayKey, romeMinutes, romeTime, todayKey } from "./time";

const HOUR_PX = 44;

type Placed = { lesson: Lesson; top: number; height: number; col: number; cols: number };

/** Side-by-side layout for overlapping lessons in one day. */
function place(lessons: Lesson[], dayStartMin: number): Placed[] {
  const sorted = [...lessons].sort((a, b) => romeMinutes(a.start) - romeMinutes(b.start));
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const l of sorted) {
    const s = romeMinutes(l.start);
    const e = Math.max(s + 15, romeDayKey(l.end) === romeDayKey(l.start) ? romeMinutes(l.end) : 24 * 60);
    if (s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= s);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(e);
    } else colEnds[col] = e;
    clusterEnd = Math.max(clusterEnd, e);
    cluster.push({
      lesson: l,
      top: ((s - dayStartMin) / 60) * HOUR_PX,
      height: ((e - s) / 60) * HOUR_PX,
      col,
      cols: 1,
    });
  }
  flush();
  return out;
}

export function WeekView({
  monday,
  lessons,
  closures,
  hues,
}: {
  monday: string;
  lessons: Lesson[];
  closures: Closure[];
  hues: Map<string, number>;
}) {
  const days = Array.from({ length: 6 }, (_, i) => addDaysKey(monday, i)); // lun–sab
  const byDay = new Map(days.map((d) => [d, [] as Lesson[]]));
  for (const l of lessons) byDay.get(romeDayKey(l.start))?.push(l);
  const closuresByDay = new Map(days.map((d) => [d, closures.filter((c) => c.date === d)]));

  const minutes = lessons.flatMap((l) => [romeMinutes(l.start), romeMinutes(l.end) || 24 * 60]);
  const startHour = Math.min(8, ...minutes.map((m) => Math.floor(m / 60)));
  const endHour = Math.max(19, ...minutes.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const today = todayKey();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `3rem repeat(6, minmax(0, 1fr))` }}>
        <div className="bg-muted/40 border-b" />
        {days.map((d) => (
          <div
            key={d}
            className={cn(
              "bg-muted/40 border-b border-l px-2 py-1.5 text-center text-xs font-medium capitalize",
              d === today && "text-primary",
            )}
          >
            {dayLabel(d)}
          </div>
        ))}

        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="text-muted-foreground absolute right-1 text-[10px]"
              style={{ top: i * HOUR_PX - 6 }}
            >
              {i > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
            </div>
          ))}
        </div>

        {days.map((d) => (
          <div key={d} className="relative border-l" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <div key={h} className="border-muted absolute inset-x-0 border-t" style={{ top: i * HOUR_PX }} />
            ))}
            {closuresByDay.get(d)!.map((c) => (
              <div
                key={c.start + c.name}
                className="bg-muted/80 text-muted-foreground absolute inset-0 z-0 flex items-start justify-center p-2 text-center text-xs font-medium"
                style={{
                  backgroundImage: "repeating-linear-gradient(45deg, transparent 0 8px, rgb(0 0 0 / 0.04) 8px 16px)",
                }}
              >
                {c.name}
              </div>
            ))}
            {place(byDay.get(d)!, startHour * 60).map((p) => (
              <Tooltip key={p.lesson.sourceId}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "absolute z-10 cursor-default overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-[11px] leading-tight shadow-xs",
                      chipClass,
                      p.lesson.cancelled && "opacity-60",
                    )}
                    style={{
                      ...hueStyle(hues.get(p.lesson.courseCode)),
                      top: p.top + 1,
                      height: Math.max(p.height - 2, 18),
                      left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                      width: `calc(${100 / p.cols}% - 4px)`,
                    }}
                  >
                    <div className={cn("font-semibold", p.lesson.cancelled && "line-through")}>{p.lesson.title}</div>
                    <div className="opacity-80">
                      {romeTime(p.lesson.start)}–{romeTime(p.lesson.end)} · {p.lesson.roomCode || p.lesson.room}
                    </div>
                    {p.lesson.cancelled && (
                      <Badge variant="destructive" className="mt-0.5 h-4 px-1 text-[10px]">
                        Annullata
                      </Badge>
                    )}
                    {p.lesson.kind !== "Lezione" && !p.lesson.cancelled && (
                      <Badge variant="outline" className="mt-0.5 h-4 px-1 text-[10px]">
                        {p.lesson.kind}
                      </Badge>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <LessonDetails lesson={p.lesson} />
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
