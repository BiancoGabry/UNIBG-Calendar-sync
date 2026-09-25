"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Closure, Lesson } from "@/lib/sync/types";
import { courseHues, dotClass, hueStyle } from "./colors";
import { ListView } from "./list-view";
import { addDaysKey, dayLabel, mondayOf, romeDayKey, todayKey } from "./time";
import { WeekView } from "./week-view";

export function SchedulePreview({
  lessons,
  closures,
  courseNames,
}: {
  lessons: Lesson[];
  closures: Closure[];
  courseNames?: Record<string, string>;
}) {
  const hues = useMemo(() => courseHues(lessons.map((l) => l.courseCode)), [lessons]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = lessons.filter((l) => !hidden.has(l.courseCode));

  const firstDay = lessons.length ? romeDayKey(lessons[0].start) : todayKey();
  const lastDay = lessons.length ? romeDayKey(lessons[lessons.length - 1].start) : todayKey();
  const initial = todayKey() >= firstDay && todayKey() <= lastDay ? todayKey() : firstDay;
  const [monday, setMonday] = useState(() => mondayOf(initial));

  const legend = [...hues.keys()].map((code) => ({
    code,
    name: courseNames?.[code] ?? lessons.find((l) => l.courseCode === code)?.courseName ?? code,
    count: lessons.filter((l) => l.courseCode === code).length,
  }));
  legend.sort((a, b) => a.name.localeCompare(b.name, "it"));

  const toggle = (code: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {legend.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => toggle(c.code)}
            className={cn(
              "hover:bg-muted flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
              hidden.has(c.code) && "opacity-40",
            )}
            title={hidden.has(c.code) ? "Mostra" : "Nascondi"}
          >
            <span className={cn("size-2.5 rounded-full", dotClass)} style={hueStyle(hues.get(c.code))} />
            <span className={cn(hidden.has(c.code) && "line-through")}>{c.name}</span>
            <span className="text-muted-foreground">{c.count}</span>
          </button>
        ))}
      </div>

      <Tabs defaultValue="week">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="week">Settimana</TabsTrigger>
            <TabsTrigger value="list">Elenco</TabsTrigger>
          </TabsList>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setMonday(addDaysKey(monday, -7))}
              aria-label="Settimana precedente"
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonday(mondayOf(todayKey()))}>
              Oggi
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setMonday(addDaysKey(monday, 7))}
              aria-label="Settimana successiva"
            >
              <ChevronRight />
            </Button>
            <span className="text-muted-foreground ml-2 text-sm">
              {dayLabel(monday, "d MMM")} – {dayLabel(addDaysKey(monday, 5), "d MMM yyyy")}
            </span>
          </div>
        </div>
        <TabsContent value="week" className="mt-3">
          <WeekView monday={monday} lessons={visible} closures={closures} hues={hues} />
        </TabsContent>
        <TabsContent value="list" className="mt-3">
          <ListView lessons={visible} closures={closures} hues={hues} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
