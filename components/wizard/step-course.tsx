"use client";

import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCatalogAction } from "@/app/actions/catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AcademicYear, CatalogSummary } from "@/lib/easystaff/combo";
import { cn } from "@/lib/utils";
import type { WizardState } from "./types";

type Props = {
  years: AcademicYear[];
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  locked: boolean; // A.A. and course cannot change once events exist
};

export function StepCourse({ years, state, update, locked }: Props) {
  // Results are keyed by academic year, so switching year shows "loading" without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ aa: string; catalog: CatalogSummary | null; error: string | null } | null>(
    null,
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCatalogAction(state.aa).then((r) => {
      if (cancelled) return;
      setLoaded({ aa: state.aa, catalog: r.ok ? r.data : null, error: r.ok ? null : r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [state.aa]);
  const current = loaded?.aa === state.aa ? loaded : null;
  const catalog = current?.catalog ?? null;
  const error = current?.error ?? null;

  const course = catalog?.courses.find((c) => c.value === state.courseCode);
  const courses = useMemo(
    () =>
      (catalog?.courses ?? [])
        .filter((c) => !state.school || c.school === state.school)
        .sort((a, b) => a.label.localeCompare(b.label, "it")),
    [catalog, state.school],
  );
  const curriculaByYear = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof course>["curricula"]>();
    for (const c of course?.curricula ?? []) groups.set(c.year, [...(groups.get(c.year) ?? []), c]);
    return [...groups.entries()].sort(([a], [b]) => Number(a) - Number(b));
  }, [course]);

  const toggleCurriculum = (value: string, label: string, checked: boolean) => {
    const rest = state.curricula.filter((c) => c.value !== value);
    update({ curricula: checked ? [...rest, { value, label }] : rest });
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Anno accademico</Label>
          <Select
            value={state.aa}
            disabled={locked}
            onValueChange={(aa) =>
              update({
                aa,
                aaLabel: years.find((y) => y.value === aa)?.label ?? aa,
                courseCode: "",
                courseLabel: "",
                curricula: [],
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.value} value={y.value}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Dipartimento / Scuola</Label>
          <Select value={state.school || "__all__"} onValueChange={(v) => update({ school: v === "__all__" ? "" : v })}>
            <SelectTrigger className="w-full" disabled={!catalog}>
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tutti</SelectItem>
              {catalog?.schools.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Catalogo non disponibile</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label>Corso di studio</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between font-normal"
              disabled={!catalog || locked}
            >
              {!catalog && !error ? (
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="animate-spin" /> Caricamento corsi…
                </span>
              ) : course ? (
                `${course.label} (${course.type})`
              ) : (
                <span className="text-muted-foreground">Cerca un corso…</span>
              )}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command>
              <CommandInput placeholder="Nome o codice del corso…" />
              <CommandList>
                <CommandEmpty>Nessun corso trovato.</CommandEmpty>
                <CommandGroup>
                  {courses.map((c) => (
                    <CommandItem
                      key={c.value}
                      value={`${c.label} ${c.type} ${c.value}`}
                      onSelect={() => {
                        update({ courseCode: c.value, courseLabel: c.label, curricula: [], selected: [] });
                        setOpen(false);
                      }}
                    >
                      <Check className={cn(c.value === state.courseCode ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1">
                        {c.label} <span className="text-muted-foreground">({c.type})</span>
                      </span>
                      {!c.published && <span className="text-muted-foreground text-xs">non pubblicato</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {course && !course.published && (
        <Alert>
          <AlertTitle>Orario non ancora pubblicato</AlertTitle>
          <AlertDescription>
            Per questo corso EasyStaff non ha ancora periodi pubblicati. Puoi comunque configurarlo: le lezioni verranno
            sincronizzate appena compaiono.
          </AlertDescription>
        </Alert>
      )}

      {course && (
        <div className="grid gap-3">
          <Label>Anno / percorso (anche più di uno)</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {curriculaByYear.map(([year, list]) => (
              <div key={year} className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                  Anno {year}
                </div>
                <div className="grid gap-2">
                  {list.map((c) => {
                    const checked = state.curricula.some((x) => x.value === c.value);
                    return (
                      <div key={c.value} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          id={`cur-${c.value}`}
                          checked={checked}
                          disabled={locked}
                          onCheckedChange={(v) => toggleCurriculum(c.value, c.label, v === true)}
                          className="mt-0.5"
                        />
                        <label htmlFor={`cur-${c.value}`} className="cursor-pointer">
                          {c.label}
                          <span className="text-muted-foreground"> · {c.teachingCount} insegnamenti</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {course.periods.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Periodi: {course.periods.map((p) => `${p.label}${p.published ? "" : " (non pubblicato)"}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
