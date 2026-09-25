"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TeachingGroup, TeachingItem } from "@/lib/easystaff/courses";
import { cn } from "@/lib/utils";
import { suggestionFor } from "./suggest";
import type { WizardDetails, WizardState } from "./types";

type Props = {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  details: WizardDetails;
};

export function allItems(groups: TeachingGroup[]): TeachingItem[] {
  return groups.flatMap((g) => [...(g.main ? [g.main] : []), ...g.exercises]);
}

function TeachingRow({
  item,
  checked,
  onChange,
  exercise,
}: {
  item: TeachingItem;
  checked: boolean;
  onChange: (v: boolean) => void;
  exercise?: boolean;
}) {
  const id = `t-${item.code}`;
  return (
    <div className={cn("hover:bg-muted/50 flex items-start gap-3 rounded-md px-2 py-1.5", exercise && "ml-6")}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm", !exercise && "font-medium")}>{item.name}</div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {item.teacher && <span>{item.teacher}</span>}
            {item.periodLabel && (
              <span>
                {item.periodLabel}
                {item.periodPublished === false && " · non pubblicato"}
              </span>
            )}
            <span>{item.lessonCount > 0 ? `${item.lessonCount} lezioni` : "nessuna lezione in orario"}</span>
            <span className="font-mono opacity-70">{item.code}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {item.letterRange && <Badge variant="secondary">{`${item.letterRange.from}–${item.letterRange.to}`}</Badge>}
          {item.required === true && <Badge variant="outline">Obbligatorio</Badge>}
          {item.required === false && <Badge variant="outline">Consigliato</Badge>}
        </div>
      </label>
    </div>
  );
}

export function StepTeachings({ state, update, details }: Props) {
  const selected = new Set(state.selected);
  const items = allItems(details.groups);
  const suggestion = suggestionFor(details.groups, state.surnameInitial);

  const set = (codes: string[], value: boolean) => {
    const next = new Set(selected);
    for (const c of codes) {
      if (value) next.add(c);
      else next.delete(c);
    }
    update({ selected: [...next] });
  };

  const applyInitial = (initial: string) => {
    const letter = initial
      .slice(-1)
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const s = suggestionFor(details.groups, letter);
    const next = new Set(selected);
    for (const g of details.groups) {
      for (const e of g.exercises) {
        if (!e.letterRange) continue; // no letters in the name: leave it to the user
        if (s.selected.has(e.code)) next.add(e.code);
        else next.delete(e.code);
      }
    }
    update({ surnameInitial: letter, selected: letter ? [...next] : state.selected });
  };

  const onlyRequired = () => {
    const next = new Set<string>();
    for (const g of details.groups) {
      if (g.main && g.main.required !== false) next.add(g.main.code);
      for (const e of g.exercises) {
        if (e.required === false) continue;
        if (!e.letterRange || !state.surnameInitial || suggestion.selected.has(e.code)) next.add(e.code);
      }
    }
    update({ selected: [...next] });
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label htmlFor="initial">Iniziale del cognome</Label>
          <Input
            id="initial"
            className="w-24 text-center uppercase"
            maxLength={1}
            value={state.surnameInitial}
            onChange={(e) => applyInitial(e.target.value)}
            placeholder="es. R"
          />
        </div>
        <p className="text-muted-foreground max-w-md text-xs">
          Preseleziona i gruppi di esercitazione della tua lettera (A-L, M-Z, …). È solo un suggerimento: puoi cambiare
          tutto a mano.
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set(
                items.map((i) => i.code),
                true,
              )
            }
          >
            Seleziona tutti
          </Button>
          <Button variant="outline" size="sm" onClick={() => update({ selected: [] })}>
            Deseleziona tutti
          </Button>
          <Button variant="outline" size="sm" onClick={onlyRequired}>
            Solo obbligatori
          </Button>
        </div>
      </div>

      {details.gridError && (
        <p className="text-destructive text-sm">
          Orario non disponibile per ora ({details.gridError}): elenco dal catalogo.
        </p>
      )}

      <div className="grid gap-3">
        {details.groups.map((g) => {
          const codes = [...(g.main ? [g.main.code] : []), ...g.exercises.map((e) => e.code)];
          const ambiguous = suggestion.ambiguous.includes(g.key);
          const unknown = state.surnameInitial && suggestion.unknown.includes(g.key);
          return (
            <div key={g.key} className="rounded-lg border p-2">
              {g.main ? (
                <TeachingRow
                  item={g.main}
                  checked={selected.has(g.main.code)}
                  onChange={(v) => set([g.main!.code], v)}
                />
              ) : (
                <div className="flex items-center gap-3 px-2 py-1.5">
                  <Checkbox
                    id={`g-${g.key}`}
                    checked={
                      codes.every((c) => selected.has(c))
                        ? true
                        : codes.some((c) => selected.has(c))
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => set(codes, v === true)}
                  />
                  <label htmlFor={`g-${g.key}`} className="cursor-pointer text-sm font-medium">
                    {g.title}
                  </label>
                </div>
              )}
              {g.exercises.map((e) => (
                <TeachingRow
                  key={e.code}
                  item={e}
                  exercise
                  checked={selected.has(e.code)}
                  onChange={(v) => set([e.code], v)}
                />
              ))}
              {(ambiguous || unknown) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ml-8 flex w-fit items-center gap-1.5 px-2 pt-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" />
                      {ambiguous
                        ? "Più gruppi compatibili con la tua lettera: controlla"
                        : "Gruppi senza lettere nel nome: scegli a mano"}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>La divisione in gruppi viene letta dal nome dell&apos;esercitazione.</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-sm">{state.selected.length} insegnamenti selezionati</p>
    </div>
  );
}
