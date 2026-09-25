"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { EventOptions } from "@/lib/sync/event";
import { EVENT_COLORS, type WizardState } from "./types";

const REMINDERS = [
  { value: "none", label: "Nessuno" },
  { value: "default", label: "Predefinito del calendario" },
  ...[5, 10, 15, 30, 60, 120].map((m) => ({ value: String(m), label: `${m} minuti prima` })),
];

function reminderValue(o: EventOptions): string {
  return o.reminder.mode === "minutes" ? String(o.reminder.minutes) : o.reminder.mode;
}

export function StepOptions({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  const o = state.options;
  const set = (patch: Partial<EventOptions>) => update({ options: { ...o, ...patch } });
  const example = o.titlePrefix === "always" ? "[Lezione] FISICA I" : "FISICA I";
  const exampleExam = o.titlePrefix === "never" ? "ANALISI MATEMATICA I" : "[Prova in itinere] ANALISI MATEMATICA I";

  return (
    <div className="grid max-w-xl gap-6">
      <div className="grid gap-3">
        <Label>Titolo dell&apos;evento</Label>
        <RadioGroup value={o.titlePrefix} onValueChange={(v) => set({ titlePrefix: v as EventOptions["titlePrefix"] })}>
          <div className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="never" id="prefix-never" />
            <label htmlFor="prefix-never" className="cursor-pointer">
              Solo il nome dell&apos;insegnamento
            </label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="nonLesson" id="prefix-nonLesson" />
            <label htmlFor="prefix-nonLesson" className="cursor-pointer">
              Prefisso del tipo solo per tutorati, prove in itinere, recuperi
            </label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="always" id="prefix-always" />
            <label htmlFor="prefix-always" className="cursor-pointer">
              Prefisso del tipo sempre
            </label>
          </div>
        </RadioGroup>
        <p className="text-muted-foreground text-xs">
          Esempi: &quot;{example}&quot;, &quot;{exampleExam}&quot;. Le lezioni annullate diventano &quot;❌ ANNULLATA –
          …&quot;.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Promemoria</Label>
        <Select
          value={reminderValue(o)}
          onValueChange={(v) =>
            set({ reminder: v === "none" || v === "default" ? { mode: v } : { mode: "minutes", minutes: Number(v) } })
          }
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REMINDERS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <label htmlFor="include-recommended" className="cursor-pointer">
          <div className="text-sm font-medium">Sincronizza anche le lezioni &quot;Consigliate&quot;</div>
          <div className="text-muted-foreground text-xs">Es. corsi di inglese facoltativi.</div>
        </label>
        <Switch
          id="include-recommended"
          checked={o.includeRecommended}
          onCheckedChange={(v) => set({ includeRecommended: v })}
        />
      </div>

      <div className="grid gap-2">
        <Label>Colore degli eventi</Label>
        <Select value={o.colorId ?? "calendar"} onValueChange={(v) => set({ colorId: v === "calendar" ? null : v })}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="calendar">Colore del calendario</SelectItem>
            {EVENT_COLORS.filter((c) => c.id !== "8" && c.id !== "11").map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="size-3 rounded-full" style={{ backgroundColor: c.hex }} />
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Grafite e Pomodoro sono riservati a lezioni rimosse e annullate.
        </p>
      </div>
    </div>
  );
}
